// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IdentityRegistry
 * @notice On-chain registry for ECDH public keys. Each wallet stores its own key.
 *         Signature-verified updates prevent impersonation. Gas-free reads.
 */
contract IdentityRegistry {
    // wallet address => ECDH P-256 public key (JWK JSON string)
    mapping(address => string) private pubkeys;

    // --- Events ---
    event PubkeySet(address indexed wallet, string pubkey);

    /**
     * @notice Store your ECDH public key on-chain.
     * @param pubkey  ECDH P-256 public key (JWK JSON string)
     * @dev Only the tx caller can set their own key.
     */
    function setPubkey(string calldata pubkey) external {
        require(bytes(pubkey).length > 0, "pubkey cannot be empty");
        require(bytes(pubkey).length <= 1024, "pubkey too long");
        pubkeys[msg.sender] = pubkey;
        emit PubkeySet(msg.sender, pubkey);
    }

    /**
     * @notice Get the ECDH public key for a wallet address.
     * @param wallet  The wallet address to look up
     * @return pubkey  The stored public key (empty string if not set)
     */
    function getPubkey(address wallet) external view returns (string memory) {
        return pubkeys[wallet];
    }

    /**
     * @notice Batch get public keys for multiple addresses.
     * @param wallets  Array of wallet addresses
     * @return pubkeys  Corresponding public keys in same order
     */
    function getPubkeys(address[] calldata wallets) external view returns (string[] memory) {
        string[] memory results = new string[](wallets.length);
        for (uint256 i = 0; i < wallets.length; i++) {
            results[i] = pubkeys[wallets[i]];
        }
        return results;
    }
}
