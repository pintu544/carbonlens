// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CarbonLensRegistry
/// @notice Minimal tamper-evident registry anchoring carbon-credit verification
///         records on Polygon Amoy. ALL verification logic lives off-chain; this
///         contract only records (creditIdHash => findingsHash, verdict,
///         timestamp) exactly once and tracks a single retirement per credit.
/// @dev A record exists iff timestamp != 0 (block.timestamp is never 0).
///      Verdict codes mirror the off-chain engine: 1 = VERIFIED,
///      2 = NEEDS_REVIEW, 3 = REJECTED. creditIdHash = sha256(creditId) as bytes32.
contract CarbonLensRegistry {
    uint8 public constant VERDICT_VERIFIED = 1;
    uint8 public constant VERDICT_NEEDS_REVIEW = 2;
    uint8 public constant VERDICT_REJECTED = 3;

    struct Record {
        bytes32 findingsHash;
        uint8 verdict;
        uint64 timestamp;
        bool retired;
    }

    /// @notice creditIdHash => verification record.
    mapping(bytes32 => Record) public records;

    event Anchored(
        bytes32 indexed creditIdHash,
        bytes32 findingsHash,
        uint8 verdict,
        uint64 timestamp
    );
    event Retired(bytes32 indexed creditIdHash, uint64 timestamp);

    error AlreadyAnchored(bytes32 creditIdHash);
    error NotAnchored(bytes32 creditIdHash);
    error AlreadyRetired(bytes32 creditIdHash);
    error InvalidVerdict(uint8 verdict);

    /// @notice Anchor a verification record. Reverts if this creditIdHash was
    ///         already anchored — the on-chain backstop for double counting.
    function anchorVerification(
        bytes32 creditIdHash,
        bytes32 findingsHash,
        uint8 verdict
    ) external {
        if (records[creditIdHash].timestamp != 0) {
            revert AlreadyAnchored(creditIdHash);
        }
        if (
            verdict != VERDICT_VERIFIED &&
            verdict != VERDICT_NEEDS_REVIEW &&
            verdict != VERDICT_REJECTED
        ) {
            revert InvalidVerdict(verdict);
        }
        uint64 ts = uint64(block.timestamp);
        records[creditIdHash] = Record(findingsHash, verdict, ts, false);
        emit Anchored(creditIdHash, findingsHash, verdict, ts);
    }

    /// @notice Retire an anchored credit exactly once. Reverts if the credit
    ///         was never anchored or was already retired.
    function retireCredit(bytes32 creditIdHash) external {
        Record storage r = records[creditIdHash];
        if (r.timestamp == 0) {
            revert NotAnchored(creditIdHash);
        }
        if (r.retired) {
            revert AlreadyRetired(creditIdHash);
        }
        r.retired = true;
        emit Retired(creditIdHash, uint64(block.timestamp));
    }
}
