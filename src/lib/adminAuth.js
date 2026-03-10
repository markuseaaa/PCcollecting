export async function hasAdminClaim(user) {
  if (!user) return false;
  const tokenResult = await user.getIdTokenResult(true);
  return tokenResult?.claims?.admin === true;
}
