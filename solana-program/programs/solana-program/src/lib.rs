use anchor_lang::prelude::*;

declare_id!("CEEGzYZPhBMWV49o1PCR8N7Y6CTuSjQs9sM7AFs4afgW");

pub const MAX_ARCHETYPE_LEN: usize = 32;
pub const MAX_SKILL_NAME_LEN: usize = 32;
pub const MAX_SKILLS: usize = 10;
pub const MAX_ENDORSEMENTS: usize = 20;
pub const ABANDONMENT_PENALTY: u64 = 25;
pub const ABANDONMENT_FLAG_THRESHOLD: u8 = 3;

#[program]
pub mod solana_program {
    use super::*;

    pub fn initialize_user(
        ctx: Context<InitializeUser>,
        archetype: String,
        skill_weights: Vec<SkillWeight>,
    ) -> Result<()> {
        require!(archetype.len() <= MAX_ARCHETYPE_LEN, RepError::ArchetypeTooLong);
        require!(skill_weights.len() <= MAX_SKILLS, RepError::TooManySkills);

        for sw in &skill_weights {
            require!(sw.name.len() <= MAX_SKILL_NAME_LEN, RepError::SkillNameTooLong);
        }

        let identity = &mut ctx.accounts.user_identity;
        identity.authority = ctx.accounts.signer.key();
        identity.archetype = archetype;
        identity.skill_weights = skill_weights;
        identity.karma = 0;
        identity.endorsements = Vec::new();
        identity.abandonment_count = 0;
        identity.is_flagged = false;
        identity.bump = ctx.bumps.user_identity;

        Ok(())
    }

    /// One-time setup: set the backend authority that may call penalize_abandonment.
    pub fn initialize_config(ctx: Context<InitializeConfig>, authority: Pubkey) -> Result<()> {
        ctx.accounts.config.set_inner(ProgramConfig {
            authority,
            bump: ctx.bumps.config,
        });
        Ok(())
    }

    pub fn award_karma(
        ctx: Context<AwardKarma>,
        rating: u8,
    ) -> Result<()> {
        require!(rating >= 1 && rating <= 5, RepError::InvalidRating);

        let rater_key = ctx.accounts.rater.key();
        let recipient = &mut ctx.accounts.recipient_identity;
        require!(rater_key != recipient.authority, RepError::CannotRateSelf);

        let rater_archetype = &ctx.accounts.rater_identity.archetype;
        let base_karma: u64 = rating as u64 * 10;

        let awarded = if are_complementary(rater_archetype, &recipient.archetype) {
            base_karma * 3 / 2
        } else {
            base_karma
        };

        recipient.karma = recipient.karma.checked_add(awarded).ok_or(RepError::Overflow)?;

        Ok(())
    }

    pub fn endorse_skill(
        ctx: Context<EndorseSkill>,
        skill_name: String,
    ) -> Result<()> {
        require!(skill_name.len() <= MAX_SKILL_NAME_LEN, RepError::SkillNameTooLong);

        let endorser_key = ctx.accounts.endorser.key();
        let recipient = &mut ctx.accounts.recipient_identity;
        require!(endorser_key != recipient.authority, RepError::CannotEndorseSelf);

        let skill_exists = recipient.skill_weights.iter().any(|s| s.name == skill_name);
        require!(skill_exists, RepError::SkillNotFound);

        let already_endorsed = recipient.endorsements.iter().any(|e| {
            e.endorser == endorser_key && e.skill == skill_name
        });
        require!(!already_endorsed, RepError::AlreadyEndorsed);
        require!(recipient.endorsements.len() < MAX_ENDORSEMENTS, RepError::TooManyEndorsements);

        recipient.endorsements.push(Endorsement {
            endorser: endorser_key,
            skill: skill_name,
        });

        Ok(())
    }

    /// Called by the backend authority when a user abandons a match without
    /// completing or rating it. Deducts karma and increments the abandonment
    /// counter. Once the counter exceeds the threshold the account is flagged,
    /// signalling the matching algorithm to deprioritize or block this user.
    pub fn penalize_abandonment(ctx: Context<PenalizeAbandonment>) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(
            ctx.accounts.authority.key() == config.authority,
            RepError::Unauthorized
        );

        let identity = &mut ctx.accounts.user_identity;

        identity.karma = identity.karma.saturating_sub(ABANDONMENT_PENALTY);
        identity.abandonment_count = identity
            .abandonment_count
            .checked_add(1)
            .ok_or(RepError::Overflow)?;

        if identity.abandonment_count >= ABANDONMENT_FLAG_THRESHOLD {
            identity.is_flagged = true;
        }

        Ok(())
    }
}

fn are_complementary(a: &str, b: &str) -> bool {
    const PAIRS: &[(&str, &str)] = &[
        ("builder", "designer"),
        ("hacker", "mentor"),
        ("explorer", "analyst"),
        ("creator", "connector"),
    ];

    PAIRS.iter().any(|(x, y)| {
        (a.eq_ignore_ascii_case(x) && b.eq_ignore_ascii_case(y))
            || (a.eq_ignore_ascii_case(y) && b.eq_ignore_ascii_case(x))
    })
}

// ── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(
        init,
        payer = signer,
        space = UserIdentity::MAX_SIZE,
        seeds = [b"user-identity", signer.key().as_ref()],
        bump,
    )]
    pub user_identity: Account<'info, UserIdentity>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AwardKarma<'info> {
    #[account(
        seeds = [b"user-identity", rater.key().as_ref()],
        bump = rater_identity.bump,
    )]
    pub rater_identity: Account<'info, UserIdentity>,
    pub rater: Signer<'info>,
    #[account(
        mut,
        seeds = [b"user-identity", recipient_identity.authority.as_ref()],
        bump = recipient_identity.bump,
    )]
    pub recipient_identity: Account<'info, UserIdentity>,
}

#[derive(Accounts)]
pub struct EndorseSkill<'info> {
    pub endorser: Signer<'info>,
    #[account(
        mut,
        seeds = [b"user-identity", recipient_identity.authority.as_ref()],
        bump = recipient_identity.bump,
    )]
    pub recipient_identity: Account<'info, UserIdentity>,
}

#[derive(Accounts)]
pub struct PenalizeAbandonment<'info> {
    /// Backend authority keypair — must match config.authority.
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        mut,
        seeds = [b"user-identity", user_identity.authority.as_ref()],
        bump = user_identity.bump,
    )]
    pub user_identity: Account<'info, UserIdentity>,
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = signer,
        space = 8 + 32 + 1,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ── State ───────────────────────────────────────────────────────────────────

/// Soulbound (non-transferable) identity account.
/// Derived as a PDA from the owner's wallet — no transfer instruction exists,
/// so the identity is permanently bound to the creating wallet.
#[account]
pub struct UserIdentity {
    pub authority: Pubkey,
    pub archetype: String,
    pub skill_weights: Vec<SkillWeight>,
    pub karma: u64,
    pub endorsements: Vec<Endorsement>,
    pub abandonment_count: u8,
    pub is_flagged: bool,
    pub bump: u8,
}

impl UserIdentity {
    pub const MAX_SIZE: usize = 8 // discriminator
        + 32                       // authority
        + (4 + MAX_ARCHETYPE_LEN)  // archetype (borsh string: len prefix + bytes)
        + (4 + MAX_SKILLS * SkillWeight::SIZE) // skill_weights vec
        + 8                        // karma
        + (4 + MAX_ENDORSEMENTS * Endorsement::SIZE) // endorsements vec
        + 1                        // abandonment_count
        + 1                        // is_flagged
        + 1;                       // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SkillWeight {
    pub name: String,
    pub weight: u16,
}

impl SkillWeight {
    pub const SIZE: usize = (4 + MAX_SKILL_NAME_LEN) + 2;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Endorsement {
    pub endorser: Pubkey,
    pub skill: String,
}

impl Endorsement {
    pub const SIZE: usize = 32 + (4 + MAX_SKILL_NAME_LEN);
}

#[account]
pub struct ProgramConfig {
    pub authority: Pubkey,
    pub bump: u8,
}

// ── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum RepError {
    #[msg("Archetype label exceeds maximum length")]
    ArchetypeTooLong,
    #[msg("Too many skills provided")]
    TooManySkills,
    #[msg("Skill name exceeds maximum length")]
    SkillNameTooLong,
    #[msg("Rating must be between 1 and 5")]
    InvalidRating,
    #[msg("Cannot rate yourself")]
    CannotRateSelf,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Skill not found on recipient's account")]
    SkillNotFound,
    #[msg("This skill has already been endorsed by this user")]
    AlreadyEndorsed,
    #[msg("Maximum number of endorsements reached")]
    TooManyEndorsements,
    #[msg("Cannot endorse yourself")]
    CannotEndorseSelf,
    #[msg("Only the program authority may call this instruction")]
    Unauthorized,
}
