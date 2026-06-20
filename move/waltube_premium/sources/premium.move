module waltube_premium::premium {
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::object::{Self, UID};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::vec_set::{Self, VecSet};

    // ─── Errors ─────────────────────────────────────────────

    const E_NOT_AUTHORIZED: u64 = 0;
    const E_ALREADY_UNLOCKED: u64 = 1;
    const E_INSUFFICIENT_PAYMENT: u64 = 2;
    const E_INVALID_ID: u64 = 3;

    // ─── Objects ────────────────────────────────────────────

    /// Shared per-workflow access policy.
    /// Created when a workflow is posted as premium.
    /// Key servers call `seal_approve` via dry_run to check access.
    ///
    /// The Seal IBE identity for the encrypted blob IS this object's id
    /// (`object::uid_to_bytes(&id)`). Because object ids are globally unique
    /// and cannot be forged or replayed onto another object, an attacker
    /// cannot create a competing policy that matches an existing encrypted
    /// blob's identity — which is what makes the paywall sound.
    public struct WorkflowAccessPolicy has key {
        id: UID,
        /// Creator address — always has access without paying.
        creator: address,
        /// Unlock price in MIST.
        price_mist: u64,
        /// Set of addresses that have paid and unlocked.
        unlocked_users: VecSet<address>,
    }

    // ─── Events ─────────────────────────────────────────────

    public struct PolicyCreated has copy, drop {
        policy_id: address,
        creator: address,
        price_mist: u64,
    }

    public struct WorkflowUnlocked has copy, drop {
        policy_id: address,
        user: address,
        amount_mist: u64,
    }

    // ─── Core API ───────────────────────────────────────────

    /// Called by the frontend when a creator posts a premium workflow.
    /// Creates a shared policy object that key servers evaluate. The returned
    /// object id is then used as the Seal IBE identity for encryption.
    public entry fun create_access_policy(
        price_mist: u64,
        ctx: &mut TxContext,
    ) {
        assert!(price_mist > 0, E_INSUFFICIENT_PAYMENT);

        let id = object::new(ctx);
        let policy_id = object::uid_to_address(&id);
        let creator = tx_context::sender(ctx);

        let policy = WorkflowAccessPolicy {
            id,
            creator,
            price_mist,
            unlocked_users: vec_set::empty(),
        };

        event::emit(PolicyCreated {
            policy_id,
            creator,
            price_mist,
        });

        transfer::share_object(policy);
    }

    /// Called by key servers via `dry_run_transaction_block` to decide
    /// whether to return decryption key shares.
    ///
    /// Requirements:
    /// - `id` must equal this policy's own object id (the IBE identity).
    /// - TxContext::sender() must be the creator OR in unlocked_users.
    ///
    /// If this function aborts, Seal key servers deny decryption.
    public entry fun seal_approve(
        id: vector<u8>,
        policy: &WorkflowAccessPolicy,
        ctx: &TxContext,
    ) {
        // Bind the requested IBE identity to THIS policy object, on every
        // path. Without this, anyone could create their own policy (becoming
        // its `creator`) and approve themselves for a blob they never paid
        // for. Object ids are unforgeable, so this is the security anchor.
        assert!(object::uid_to_bytes(&policy.id) == id, E_INVALID_ID);

        let sender = tx_context::sender(ctx);

        // Creator always has access.
        if (sender == policy.creator) {
            return
        };

        // Otherwise must have paid.
        assert!(
            vec_set::contains(&policy.unlocked_users, &sender),
            E_NOT_AUTHORIZED,
        );
    }

    /// Called by a viewer who wants to unlock a premium workflow.
    /// Transfers SUI payment to the creator and adds sender to unlocked_users.
    public entry fun pay_and_unlock(
        policy: &mut WorkflowAccessPolicy,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);

        // Creator doesn't need to pay.
        assert!(sender != policy.creator, E_ALREADY_UNLOCKED);

        // Prevent double-paying.
        assert!(
            !vec_set::contains(&policy.unlocked_users, &sender),
            E_ALREADY_UNLOCKED,
        );

        // Verify payment amount.
        let amount = coin::value(&payment);
        assert!(amount >= policy.price_mist, E_INSUFFICIENT_PAYMENT);

        // Transfer payment to creator.
        transfer::public_transfer(payment, policy.creator);

        // Record unlock.
        vec_set::insert(&mut policy.unlocked_users, sender);

        event::emit(WorkflowUnlocked {
            policy_id: object::id_to_address(&object::id(policy)),
            user: sender,
            amount_mist: amount,
        });
    }

    // ─── Read-only accessors ─────────────────────────────────

    public fun creator(policy: &WorkflowAccessPolicy): address {
        policy.creator
    }

    public fun price_mist(policy: &WorkflowAccessPolicy): u64 {
        policy.price_mist
    }

    public fun is_unlocked(policy: &WorkflowAccessPolicy, user: address): bool {
        vec_set::contains(&policy.unlocked_users, &user)
    }

    public fun has_unlocked_users(policy: &WorkflowAccessPolicy): bool {
        vec_set::length(&policy.unlocked_users) > 0
    }
}
