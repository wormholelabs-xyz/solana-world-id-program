use anchor_lang::pubkey;
use trident_client::fuzzing::*;

pub const MAINNET_CORE_BRIDGE_ID: Pubkey = pubkey!("worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth");

pub mod quardian_set_5_mock {
    use super::*;

    pub const MOCK_GUARDIAN_SET_INDEX: u32 = 0;
    pub const GUARDIAN_SET_0_MOCK: Pubkey = pubkey!("DS7qfSAgYsonPpKoAjcGhX9VFjXdGkiHjEDkTidf8H2P");
    pub const RECIPIENT: Pubkey = pubkey!("5yNbCZcCHeAxdmMJXcpFgmurEnygaVbCRwZNMMWETdeZ");

    pub const BYTES: [u8; 220] = [
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 55, 1, 0, 0, 0, 42, 1, 0, 2, 1, 0, 0, 0, 42, 0, 0, 0, 9,
        48, 120, 49, 51, 54, 54, 53, 97, 48, 1, 247, 19, 76, 225, 56, 131, 44, 20, 86, 242, 169,
        29, 100, 98, 30, 233, 12, 43, 221, 234, 0, 0, 0, 4, 215, 176, 254, 241, 1, 0, 2, 1, 0, 0,
        0, 85, 0, 0, 0, 0, 0, 96, 167, 79, 180, 209, 244, 100, 16, 134, 96, 124, 105, 21, 78, 211,
        169, 76, 184, 211, 127, 249, 37, 164, 65, 249, 128, 87, 134, 63, 240, 43, 247, 94, 118,
        132, 0, 6, 34, 2, 87, 89, 25, 192, 1, 0, 0, 0, 32, 41, 231, 8, 26, 76, 180, 156, 208, 17,
        156, 129, 215, 102, 217, 202, 65, 203, 223, 175, 60, 226, 28, 138, 224, 150, 59, 141, 27,
        21, 219, 77, 154,
    ];

    pub const ROOT_HASH: [u8; 32] = [
        41, 231, 8, 26, 76, 180, 156, 208, 17, 156, 129, 215, 102, 217, 202, 65, 203, 223, 175, 60,
        226, 28, 138, 224, 150, 59, 141, 27, 21, 219, 77, 154,
    ];

    pub const SIGNATURES: [[u8; 66]; 1] = [[
        0, 0, 250, 8, 140, 240, 121, 56, 62, 205, 10, 147, 202, 186, 129, 149, 190, 81, 145, 176,
        136, 12, 188, 46, 155, 20, 62, 248, 85, 23, 226, 157, 101, 78, 206, 84, 167, 89, 58, 205,
        166, 219, 85, 181, 238, 157, 204, 206, 69, 148, 123, 182, 26, 76, 145, 108, 156, 128, 35,
        110, 213, 94, 226, 33, 45, 1,
    ]];

    pub const NULLIFIER_HASH: [u8; 32] = [
        42, 169, 117, 25, 109, 193, 244, 249, 245, 123, 129, 149, 190, 169, 198, 19, 49, 224, 1,
        46, 194, 84, 132, 237, 86, 151, 130, 196, 145, 69, 114, 26,
    ];

    pub const INDEX: usize = 10;
    pub const REFERENCE: u8 = 129;

    pub const PROOF: [u8; 256] = [
        23, 118, 6, 177, 98, 109, 157, 229, 60, 202, 118, 13, 232, 144, 124, 18, 45, 205, 122, 10,
        142, 54, 214, 113, 71, 133, 100, 59, 17, 96, 74, 97, 41, 11, 54, 200, 130, 117, 145, 58,
        199, 160, 73, 62, 67, 54, 46, 255, 158, 117, 207, 196, 7, 232, 251, 59, 170, 181, 183, 3,
        35, 242, 157, 190, 10, 169, 21, 101, 54, 121, 175, 70, 113, 177, 171, 190, 13, 121, 210,
        240, 142, 227, 6, 150, 179, 54, 184, 19, 33, 246, 210, 30, 240, 129, 124, 100, 17, 119,
        153, 139, 205, 136, 161, 20, 206, 200, 254, 100, 120, 59, 162, 143, 63, 177, 204, 123, 130,
        230, 67, 138, 65, 69, 150, 236, 29, 42, 96, 96, 16, 164, 83, 83, 222, 211, 165, 148, 245,
        153, 182, 212, 171, 189, 229, 141, 111, 100, 226, 161, 215, 5, 205, 170, 104, 80, 64, 14,
        181, 131, 18, 57, 45, 86, 187, 162, 113, 135, 100, 252, 144, 98, 185, 33, 89, 49, 73, 55,
        169, 104, 63, 73, 30, 14, 119, 37, 60, 211, 161, 0, 12, 230, 1, 99, 35, 131, 181, 103, 152,
        249, 13, 50, 117, 100, 151, 208, 10, 171, 62, 212, 82, 10, 183, 67, 225, 113, 143, 205, 7,
        7, 67, 94, 28, 242, 75, 253, 35, 235, 23, 23, 224, 75, 39, 195, 185, 201, 141, 9, 138, 184,
        248, 118, 245, 166, 250, 114, 210, 220, 204, 104, 80, 247, 201, 141, 128, 215, 84, 154,
    ];
}
