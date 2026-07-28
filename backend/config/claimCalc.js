// Single source of truth for how a claim's total amount is calculated —
// used by the expense create route, the update route, and the admin
// "Recalculate Claim Totals" tool. Having one shared function means these
// can never silently drift out of sync with each other again, the way
// claim_amount and the on-screen Total Claim Summary once did.
function computeClaimTotal(journey, returnsToUse, stay, travel, food, hotel, misc) {
  const sumArr = (arr, key) => (arr || []).reduce((s, r) => s + (parseFloat(r[key]) || 0), 0);
  // Travel entries carry two amount fields — `amount` (the rate typed in) and
  // `total_amount` (a computed field). A row loaded from an existing draft
  // that wasn't re-touched in this save can have total_amount empty while
  // amount is still set — fall back to amount here too, matching
  // insertTravel() and the on-screen Total Claim Summary, so claim_amount
  // never silently drops a travel entry's value.
  const sumTravel = (arr) => (arr || []).reduce((s, r) => s + (parseFloat(r.total_amount ?? r.amount) || 0), 0);
  return sumArr(journey,'total_amount') + sumArr(returnsToUse,'total_amount') +
         sumArr(stay,'total_amount')    + sumTravel(travel) +
         sumArr(food,'amount')          + sumArr(hotel,'amount') + sumArr(misc,'amount');
}

module.exports = { computeClaimTotal };
