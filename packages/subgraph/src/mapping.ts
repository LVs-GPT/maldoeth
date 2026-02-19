import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Registered,
  URIUpdated,
  Transfer,
} from "../generated/ERC8004Identity/ERC8004Identity";
import {
  Agent,
  URIUpdate,
  OwnershipTransfer,
} from "../generated/schema";

// ─── Registered ──────────────────────────────────────────────────────
// Fired once per agent mint. Creates the Agent entity.
export function handleRegistered(event: Registered): void {
  let id = event.params.agentId.toString();
  let agent = new Agent(id);

  agent.agentId = event.params.agentId;
  agent.owner = event.params.owner;
  agent.agentURI = event.params.agentURI;
  agent.blockNumber = event.block.number;
  agent.registeredAt = event.block.timestamp;
  agent.txHash = event.transaction.hash;
  agent.uriUpdated = false;

  agent.save();
}

// ─── URIUpdated ──────────────────────────────────────────────────────
// Fired when an agent owner calls setAgentURI(). Updates the Agent URI
// and stores an immutable audit record.
export function handleURIUpdated(event: URIUpdated): void {
  let id = event.params.agentId.toString();
  let agent = Agent.load(id);
  if (agent == null) return;

  // Audit trail
  let updateId =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();
  let update = new URIUpdate(updateId);
  update.agent = agent.id;
  update.oldURI = agent.agentURI;
  update.newURI = event.params.newURI;
  update.updatedBy = event.params.updatedBy;
  update.blockNumber = event.block.number;
  update.timestamp = event.block.timestamp;
  update.txHash = event.transaction.hash;
  update.save();

  // Update agent
  agent.agentURI = event.params.newURI;
  agent.uriUpdated = true;
  agent.save();
}

// ─── Transfer ────────────────────────────────────────────────────────
// Standard ERC-721 transfer. Updates owner and stores audit record.
// Mint transfers (from = 0x0) are skipped — handleRegistered covers those.
export function handleTransfer(event: Transfer): void {
  let zeroAddress = Bytes.fromHexString(
    "0x0000000000000000000000000000000000000000",
  ) as Bytes;

  // Skip mints — already handled by Registered
  if (event.params.from == zeroAddress) return;

  let id = event.params.tokenId.toString();
  let agent = Agent.load(id);
  if (agent == null) return;

  // Audit trail
  let transferId =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();
  let transfer = new OwnershipTransfer(transferId);
  transfer.agent = agent.id;
  transfer.from = event.params.from;
  transfer.to = event.params.to;
  transfer.blockNumber = event.block.number;
  transfer.timestamp = event.block.timestamp;
  transfer.txHash = event.transaction.hash;
  transfer.save();

  // Update owner
  agent.owner = event.params.to;
  agent.save();
}
