import { createHmac, timingSafeEqual } from 'node:crypto'

interface VerifyLineSignatureInput {
  body: string
  signature: string | null
  channelSecret: string
}

export function verifyLineSignature({
  body,
  signature,
  channelSecret,
}: VerifyLineSignatureInput): boolean {
  if (!signature) {
    return false
  }

  const expectedSignature = createHmac('sha256', channelSecret)
    .update(body, 'utf8')
    .digest('base64')

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8')
  const actualBuffer = Buffer.from(signature, 'utf8')

  if (expectedBuffer.length !== actualBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, actualBuffer)
}
