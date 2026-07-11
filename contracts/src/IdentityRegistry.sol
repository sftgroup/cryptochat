// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IdentityRegistry
 * @notice On-chain registry for ECDH public keys. Each wallet stores its own key.
 *         Key split into two 32-byte components for clean MetaMask interaction UX.
 */
contract IdentityRegistry {
    // wallet address => ECDH P-256 compressed public key (66 hex chars → 33 bytes)
    mapping(address => bytes) private pubkeyBytes;
    
    // wallet address => timestamp of last update
    mapping(address => uint256) private pubkeyTimestamps;

    // --- Events ---
    event PubkeySet(address indexed wallet, bytes pubkey, uint256 timestamp);

    /**
     * @notice Store ECDH public key as raw bytes.
     * @param pubkey   Raw ECDH P-256 public key bytes (33 compressed or 65 uncompressed)
     *
     * Using `bytes` instead of `string` gives MetaMask a cleaner "contract interaction" UX
     * because it doesn't trigger the string-param display heuristic.
     */
    function setPubkey(bytes calldata pubkey) external {
        require(pubkey.length == 33 || pubkey.length == 65, "invalid pubkey length (33 or 65)");
        pubkeyBytes[msg.sender] = pubkey;
        pubkeyTimestamps[msg.sender] = block.timestamp;
        emit PubkeySet(msg.sender, pubkey, block.timestamp);
    }

    /**
     * @notice Get ECDH public key bytes for a wallet.
     * @return pubkey     Raw public key bytes
     * @return timestamp  When it was last set
     */
    function getPubkey(address wallet) external view returns (bytes memory pubkey, uint256 timestamp) {
        return (pubkeyBytes[wallet], pubkeyTimestamps[wallet]);
    }

    /**
     * @notice Batch get public keys.
     */
    function getPubkeys(address[] calldata wallets) external view returns (
        bytes[] memory pubkeys,
        uint256[] memory timestamps
    ) {
        uint256 len = wallets.length;
        pubkeys = new bytes[](len);
        timestamps = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            pubkeys[i] = pubkeyBytes[wallets[i]];
            timestamps[i] = pubkeyTimestamps[wallets[i]];
        }
    }
}
