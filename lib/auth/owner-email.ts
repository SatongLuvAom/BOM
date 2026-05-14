export function getOwnerEmail() {
  return process.env.OWNER_EMAIL?.trim().toLowerCase() ?? ''
}

export function isOwnerEmail(email: string | null | undefined) {
  const ownerEmail = getOwnerEmail()
  return Boolean(ownerEmail && email?.trim().toLowerCase() === ownerEmail)
}
