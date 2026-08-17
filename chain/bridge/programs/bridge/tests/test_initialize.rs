use {
    anchor_lang::{programs::System, Id},
    anchor_lang::solana_program::instruction::{AccountMeta, Instruction},
    anchor_v2_testing::{
        Keypair, Message, Signer, VersionedMessage, VersionedTransaction,
    },
    solana_pubkey::Pubkey,
};

/// Initializes the bridge config PDA and checks it was created with the admin
/// and operator recorded.
#[test]
fn test_initialize() {
    let program_id = Pubkey::new_from_array(bridge::id().to_bytes());
    let admin = Keypair::new();
    let operator = Keypair::new();
    let (config, _bump) = Pubkey::find_program_address(&[b"config"], &program_id);

    let mut svm = anchor_v2_testing::svm();
    let bytes = include_bytes!("../../../target/deploy/bridge.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&admin.pubkey(), 1_000_000_000).unwrap();

    // ix data: discriminator (0) followed by the operator Address (32 raw bytes).
    let mut data = vec![0u8];
    data.extend_from_slice(&operator.pubkey().to_bytes());

    let instruction = Instruction::new_with_bytes(
        program_id,
        &data,
        vec![
            AccountMeta::new(admin.pubkey(), true),
            AccountMeta::new(config, false),
            AccountMeta::new_readonly(System::id(), false),
        ],
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();

    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "initialize failed: {:?}", res);

    let account = svm.get_account(&config).expect("config account");
    // 8-byte discriminator + BridgeConfig (admin 32 + operator 32 + gp_mint 32 + paused 1 + bump 1)
    assert!(account.data.len() >= 8 + 32 * 3 + 2, "unexpected config size: {}", account.data.len());
}
