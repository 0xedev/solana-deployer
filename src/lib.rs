use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};

// Replace with your own program ID
declare_id!("7S8e5bweirM9Dq7ebtTb3FQg3QWGb9L1nhF43Fc2zySZ");

#[program]
pub mod solana_token_factory {
    use super::*;

    pub fn create_token(
        ctx: Context<CreateToken>,
        name: String,
        symbol: String,
        initial_supply: u64,
        decimals: u8,
        _factory_bump: u8, // The bump is available in factory_state.bump, so this argument is not needed.
    ) -> Result<()> {
        let factory_state = &mut ctx.accounts.factory_state;

        // Initialize factory state on first use
        if factory_state.owner == Pubkey::default() {
            factory_state.owner = ctx.accounts.owner.key();
            factory_state.creation_fee = 100_000; // 0.0001 SOL
        }

        if name.is_empty() || symbol.is_empty() || initial_supply == 0 {
            msg!("Invalid input: name/symbol cannot be empty and supply must be greater than zero.");
            return err!(ErrorCode::InvalidInput);
        }

        if ctx.accounts.payer.lamports() < factory_state.creation_fee {
            msg!("Insufficient funds to pay the creation fee.");
            return err!(ErrorCode::InsufficientFunds);
        }

        // Transfer fee to the factory owner
        if factory_state.creation_fee > 0 {
             let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.payer.key(),
                &ctx.accounts.owner.key(),
                factory_state.creation_fee,
            );
            anchor_lang::solana_program::program::invoke(
                &transfer_ix,
                &[
                    ctx.accounts.payer.to_account_info(),
                    ctx.accounts.owner.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
        }


        // Mint the initial supply to the payer's associated token account
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.payer_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        token::mint_to(cpi_ctx, initial_supply)?;

        // Store the metadata on-chain
        let token_meta = &mut ctx.accounts.token_metadata;
        token_meta.mint = ctx.accounts.mint.key();
        token_meta.name = name.clone();
        token_meta.symbol = symbol.clone();
        token_meta.creator = ctx.accounts.payer.key();

        emit!(TokenCreated {
            mint: token_meta.mint,
            name,
            symbol,
            supply: initial_supply,
            creator: ctx.accounts.payer.key(),
        });

        Ok(())
    }

    pub fn update_fee(ctx: Context<UpdateFee>, new_fee: u64) -> Result<()> {
        let factory_state = &mut ctx.accounts.factory_state;

        if ctx.accounts.payer.key() != factory_state.owner {
            msg!("Only the factory owner can update the fee.");
            return err!(ErrorCode::Unauthorized);
        }

        // Allow setting fee to 0, but not excessively high
        if new_fee > 100_000_000_000 { // 100 SOL limit
            msg!("Invalid fee: must be less than or equal to 100 SOL.");
            return err!(ErrorCode::InvalidFee);
        }

        factory_state.creation_fee = new_fee;
        msg!("Fee updated to {} lamports", new_fee);

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(name: String, symbol: String, initial_supply: u64, decimals: u8, factory_bump: u8)]
pub struct CreateToken<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + 32 + 8, // Discriminator + owner pubkey + fee u64
        seeds = [b"factory_state"],
        bump
    )]
    pub factory_state: Account<'info, FactoryState>,

    #[account(
        init,
        payer = payer,
        mint::decimals = decimals,
        mint::authority = payer,
        mint::freeze_authority = payer
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = TokenMetadata::LEN,
        seeds = [b"token_metadata", mint.key().as_ref()],
        bump
    )]
    pub token_metadata: Account<'info, TokenMetadata>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,

    /// The owner of the factory, who receives the fees.
    /// CHECK: This is not read from, only used as a destination for the fee transfer.
    #[account(mut)]
    pub owner: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateFee<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Owner's account, verified through has_one constraint
    #[account(mut)]
    pub owner: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"factory_state"],
        bump,
        has_one = owner @ErrorCode::Unauthorized,
    )]
    pub factory_state: Account<'info, FactoryState>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct FactoryState {
    pub owner: Pubkey,
    pub creation_fee: u64,
}

#[account]
pub struct TokenMetadata {
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub creator: Pubkey,
}

impl TokenMetadata {
    // Define a constant for the space calculation to keep it clean.
    // 8 (discriminator) + 32 (mint) + (4 + 32 string len) + (4 + 10 string len) + 32 (creator)
    pub const LEN: usize = 8 + 32 + (4 + 32) + (4 + 10) + 32;
}

#[event]
pub struct TokenCreated {
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub supply: u64,
    pub creator: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid input: name, symbol, or supply is invalid.")]
    InvalidInput,
    #[msg("Insufficient funds to pay creation fee.")]
    InsufficientFunds,
    #[msg("This action can only be performed by the owner.")]
    Unauthorized,
    #[msg("The specified fee amount is invalid.")]
    InvalidFee,
}
