/** Parse an onchain error into a user-readable string. */
export function parseOnchainError(error: unknown): string {
  if (!error) return 'Unknown error.'
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('user denied') || (error as { code?: number })?.code === 4001) {
    return 'Transaction cancelled.'
  }
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
    return 'Insufficient balance.'
  }
  // Try to extract a Solidity revert reason.
  const reasonMatch = msg.match(/reason="([^"]+)"/) ?? msg.match(/reverted with reason string '([^']+)'/)
  if (reasonMatch) return `Transaction failed: ${reasonMatch[1]}`
  if (msg.includes('revert')) return 'Transaction reverted. Check vault state and try again.'
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('fetch')) {
    return 'Network error. Check your connection and retry.'
  }
  return 'Something went wrong. Please try again.'
}
