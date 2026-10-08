// All tunable risk-engine knobs live here. Change numbers, not code.
module.exports = {
  // Score ranges -> level + decision. Evaluated top to bottom.
  thresholds: [
    { max: 30, level: 'low', decision: 'approve' },
    { max: 60, level: 'medium', decision: 'verify' },
    { max: 80, level: 'high', decision: 'strong_verify' },
    { max: 100, level: 'critical', decision: 'hold' },
  ],

  // Amount compared with the user's average transaction.
  amountTiers: [
    { maxRatio: 1.5, score: 0 },
    { maxRatio: 3, score: 12 },
    { maxRatio: 6, score: 25 },
    { maxRatio: 10, score: 35 },
    { maxRatio: Infinity, score: 40 },
  ],

  weights: {
    newRecipient: 25,
    unusualLocation: 10,
    untrustedDevice: 15,
    intentMismatchPerIssue: 10,
    intentMismatchMax: 20,
    scamSignals: 20,
    lowConfidence: 10, // intent confidence < lowConfidenceBelow
    mediumConfidence: 5, // intent confidence < mediumConfidenceBelow
  },

  lowConfidenceBelow: 0.4,
  mediumConfidenceBelow: 0.6,

  // What the user must do for each decision.
  verification: {
    approve: 'none',
    verify: 'confirm',
    strong_verify: 'otp',
    hold: 'blocked',
  },
};
