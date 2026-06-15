module cuerate_attribution::attribution {
    use std::option::{Self, Option};
    use std::vector;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    const E_EMPTY_PROMPT_KEY: u64 = 1;
    const E_EMPTY_CONTENT_BLOB_ID: u64 = 2;

    /// One immutable provenance object per original prompt or fork.
    ///
    /// `prompt_key` is the offchain Cuerate/Firestore prompt id.
    /// `content_blob_id` is the Walrus blob id for the visible media.
    /// `metadata_blob_id` can point at a Walrus JSON blob later; today the app
    /// may pass a thumbnail blob id or an empty vector while metadata remains in
    /// Firestore.
    public struct AttributionRecord has key, store {
        id: UID,
        prompt_key: vector<u8>,
        content_blob_id: vector<u8>,
        metadata_blob_id: vector<u8>,
        parent_record_id: Option<ID>,
        parent_prompt_key: Option<vector<u8>>,
        root_prompt_key: vector<u8>,
        original_author: address,
        creator: address,
        fork_depth: u64,
        created_at_ms: u64,
    }

    public struct PromptRecorded has copy, drop {
        record_id: ID,
        prompt_key: vector<u8>,
        creator: address,
        content_blob_id: vector<u8>,
        metadata_blob_id: vector<u8>,
        created_at_ms: u64,
    }

    public struct PromptForked has copy, drop {
        record_id: ID,
        prompt_key: vector<u8>,
        parent_record_id: ID,
        parent_prompt_key: vector<u8>,
        root_prompt_key: vector<u8>,
        original_author: address,
        fork_author: address,
        fork_depth: u64,
        content_blob_id: vector<u8>,
        metadata_blob_id: vector<u8>,
        created_at_ms: u64,
    }

    public entry fun record_prompt(
        prompt_key: vector<u8>,
        content_blob_id: vector<u8>,
        metadata_blob_id: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(vector::length(&prompt_key) > 0, E_EMPTY_PROMPT_KEY);
        assert!(vector::length(&content_blob_id) > 0, E_EMPTY_CONTENT_BLOB_ID);

        let creator = tx_context::sender(ctx);
        let created_at_ms = clock::timestamp_ms(clock);
        let id = object::new(ctx);
        let record_id = object::uid_to_inner(&id);

        let record = AttributionRecord {
            id,
            prompt_key: copy prompt_key,
            content_blob_id: copy content_blob_id,
            metadata_blob_id: copy metadata_blob_id,
            parent_record_id: option::none<ID>(),
            parent_prompt_key: option::none<vector<u8>>(),
            root_prompt_key: copy prompt_key,
            original_author: creator,
            creator,
            fork_depth: 0,
            created_at_ms,
        };

        event::emit(PromptRecorded {
            record_id,
            prompt_key,
            creator,
            content_blob_id,
            metadata_blob_id,
            created_at_ms,
        });

        // Share the record so any account can pass it as `&AttributionRecord`
        // when forking. Owned objects could only be used by their owner, which
        // blocked cross-account forks.
        transfer::public_share_object(record);
    }

    public entry fun record_fork(
        parent: &AttributionRecord,
        prompt_key: vector<u8>,
        content_blob_id: vector<u8>,
        metadata_blob_id: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(vector::length(&prompt_key) > 0, E_EMPTY_PROMPT_KEY);
        assert!(vector::length(&content_blob_id) > 0, E_EMPTY_CONTENT_BLOB_ID);

        let fork_author = tx_context::sender(ctx);
        let parent_record_id = object::id(parent);
        let parent_prompt_key = copy parent.prompt_key;
        let root_prompt_key = copy parent.root_prompt_key;
        let original_author = parent.original_author;
        let fork_depth = parent.fork_depth + 1;
        let created_at_ms = clock::timestamp_ms(clock);
        let id = object::new(ctx);
        let record_id = object::uid_to_inner(&id);

        let record = AttributionRecord {
            id,
            prompt_key: copy prompt_key,
            content_blob_id: copy content_blob_id,
            metadata_blob_id: copy metadata_blob_id,
            parent_record_id: option::some<ID>(parent_record_id),
            parent_prompt_key: option::some<vector<u8>>(copy parent_prompt_key),
            root_prompt_key: copy root_prompt_key,
            original_author,
            creator: fork_author,
            fork_depth,
            created_at_ms,
        };

        event::emit(PromptForked {
            record_id,
            prompt_key,
            parent_record_id,
            parent_prompt_key,
            root_prompt_key,
            original_author,
            fork_author,
            fork_depth,
            content_blob_id,
            metadata_blob_id,
            created_at_ms,
        });

        // Share so descendants can fork-of-fork via &AttributionRecord input.
        transfer::public_share_object(record);
    }

    public fun prompt_key(record: &AttributionRecord): vector<u8> {
        copy record.prompt_key
    }

    public fun content_blob_id(record: &AttributionRecord): vector<u8> {
        copy record.content_blob_id
    }

    public fun parent_record_id(record: &AttributionRecord): Option<ID> {
        copy record.parent_record_id
    }

    public fun root_prompt_key(record: &AttributionRecord): vector<u8> {
        copy record.root_prompt_key
    }

    public fun original_author(record: &AttributionRecord): address {
        record.original_author
    }

    public fun creator(record: &AttributionRecord): address {
        record.creator
    }

    public fun fork_depth(record: &AttributionRecord): u64 {
        record.fork_depth
    }
}
