module waltube_royalties::royalties {
    use std::option::{Self, Option};
    use std::vector;
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    // ─── Errors ─────────────────────────────────────────────

    const E_EMPTY_RECIPIENTS: u64 = 0;
    const E_SHARES_LENGTH_MISMATCH: u64 = 1;
    const E_SHARES_SUM_INVALID: u64 = 2;
    const E_ZERO_PAYMENT: u64 = 3;
    const E_SHARE_TOO_LARGE: u64 = 4;

    const BASIS_POINTS: u64 = 10_000;

    // ─── Objects ────────────────────────────────────────────

    /// Shared per-prompt royalty configuration.
    /// Created once after a prompt is forked; anyone can call `receive_payment`.
    public struct RoyaltyConfig has key {
        id: UID,
        /// Off-chain prompt id (Firestore key) for easy lookup.
        prompt_key: vector<u8>,
        /// Parallel arrays: recipient[i] gets shares_bps[i] out of 10,000.
        recipients: vector<address>,
        shares_bps: vector<u64>,
    }

    /// Global shared registry: prompt_key -> RoyaltyConfig ID.
    /// Created once by the deployer.
    public struct RoyaltyRegistry has key {
        id: UID,
        prompt_keys: vector<vector<u8>>,
        config_ids: vector<ID>,
    }

    // ─── Events ─────────────────────────────────────────────

    public struct RoyaltyConfigCreated has copy, drop {
        config_id: ID,
        prompt_key: vector<u8>,
        recipient_count: u64,
    }

    public struct PaymentDistributed has copy, drop {
        config_id: ID,
        prompt_key: vector<u8>,
        payer: address,
        total_amount: u64,
        recipient: address,
        share_bps: u64,
        amount: u64,
    }

    public struct PaymentReceived has copy, drop {
        config_id: ID,
        prompt_key: vector<u8>,
        payer: address,
        total_amount: u64,
    }

    // ─── Constructor ────────────────────────────────────────

    /// Deployer calls this once to create the shared registry.
    public fun create_registry(ctx: &mut TxContext) {
        let registry = RoyaltyRegistry {
            id: object::new(ctx),
            prompt_keys: vector[],
            config_ids: vector[],
        };
        transfer::share_object(registry);
    }

    // ─── Core API ───────────────────────────────────────────

    /// Called by the frontend/backend right after `record_fork`.
    ///
    /// `prompt_key`      — the new fork's off-chain id.
    /// `recipients`      — ordered list of addresses (original, fork-parents, current-creator).
    /// `shares_bps`      — parallel array of basis points. Must sum to exactly 10,000.
    ///
    /// The frontend is responsible for computing the fork chain and the correct split.
    /// Example: [original_author, fork1_author, current_creator]
    ///          [500, 300, 9000]  ->  5%, 3%, 90%
    public fun create_royalty_config(
        registry: &mut RoyaltyRegistry,
        prompt_key: vector<u8>,
        recipients: vector<address>,
        shares_bps: vector<u64>,
        ctx: &mut TxContext,
    ) {
        let recipient_count = vector::length(&recipients);
        assert!(recipient_count > 0, E_EMPTY_RECIPIENTS);
        assert!(vector::length(&shares_bps) == recipient_count, E_SHARES_LENGTH_MISMATCH);

        // Verify shares sum to exactly 10,000 (100%).
        let mut sum = 0u64;
        let mut i = 0;
        while (i < recipient_count) {
            let share = *vector::borrow(&shares_bps, i);
            assert!(share <= BASIS_POINTS, E_SHARE_TOO_LARGE);
            sum = sum + share;
            i = i + 1;
        };
        assert!(sum == BASIS_POINTS, E_SHARES_SUM_INVALID);

        let id = object::new(ctx);
        let config_id = object::uid_to_inner(&id);

        let config = RoyaltyConfig {
            id,
            prompt_key: copy prompt_key,
            recipients,
            shares_bps,
        };

        // Register in the shared registry so anyone can look it up.
        vector::push_back(&mut registry.prompt_keys, copy prompt_key);
        vector::push_back(&mut registry.config_ids, config_id);

        event::emit(RoyaltyConfigCreated {
            config_id,
            prompt_key: copy prompt_key,
            recipient_count,
        });

        transfer::share_object(config);
    }

    /// Anyone can call this to pay royalties for a prompt.
    /// The coin is atomically split and distributed to all configured recipients.
    public fun receive_payment(
        config: &RoyaltyConfig,
        mut payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let total = coin::value(&payment);
        assert!(total > 0, E_ZERO_PAYMENT);

        let recipient_count = vector::length(&config.recipients);
        let payer = tx_context::sender(ctx);
        let mut remaining = total;

        event::emit(PaymentReceived {
            config_id: object::id(config),
            prompt_key: copy config.prompt_key,
            payer,
            total_amount: total,
        });

        let mut i = 0;
        while (i < recipient_count) {
            let recipient = *vector::borrow(&config.recipients, i);
            let share_bps = *vector::borrow(&config.shares_bps, i);

            // Last recipient gets the remainder to avoid rounding dust.
            let amount = if (i == recipient_count - 1) {
                remaining
            } else {
                (total * share_bps) / BASIS_POINTS
            };

            if (amount > 0 && remaining > 0) {
                // Cap at remaining balance just in case.
                let actual = if (amount > remaining) { remaining } else { amount };

                let split_balance = balance::split(coin::balance_mut(&mut payment), actual);
                let split_coin = coin::from_balance(split_balance, ctx);
                transfer::public_transfer(split_coin, recipient);

                event::emit(PaymentDistributed {
                    config_id: object::id(config),
                    prompt_key: copy config.prompt_key,
                    payer,
                    total_amount: total,
                    recipient,
                    share_bps,
                    amount: actual,
                });

                remaining = remaining - actual;
            };

            i = i + 1;
        };

        // Any dust left (should be 0 or 1 MIST) goes to the first recipient.
        if (coin::value(&payment) > 0) {
            let first_recipient = *vector::borrow(&config.recipients, 0);
            transfer::public_transfer(payment, first_recipient);
        } else {
            // Payment coin is empty — destroy it cleanly.
            let _empty = payment;
            let _zero_balance = coin::into_balance(_empty);
            balance::destroy_zero(_zero_balance);
        };
    }

    // ─── Read-only accessors ─────────────────────────────────

    public fun prompt_key(config: &RoyaltyConfig): vector<u8> {
        copy config.prompt_key
    }

    public fun recipients(config: &RoyaltyConfig): vector<address> {
        copy config.recipients
    }

    public fun shares_bps(config: &RoyaltyConfig): vector<u64> {
        copy config.shares_bps
    }

    // ─── Registry lookup (on-chain convenience) ────────────────

    public fun lookup_config_id(
        registry: &RoyaltyRegistry,
        prompt_key: &vector<u8>,
    ): Option<ID> {
        let len = vector::length(&registry.prompt_keys);
        let mut i = 0;
        while (i < len) {
            let key = *vector::borrow(&registry.prompt_keys, i);
            if (key == *prompt_key) {
                let id = *vector::borrow(&registry.config_ids, i);
                return option::some(id)
            };
            i = i + 1;
        };
        option::none()
    }
}
