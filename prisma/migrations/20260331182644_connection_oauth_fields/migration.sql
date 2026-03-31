-- AlterTable
ALTER TABLE "Connection" ADD COLUMN     "authorizationEndpoint" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "refreshToken" TEXT,
ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tokenEndpoint" TEXT;

-- CreateTable
CREATE TABLE "OauthSession" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OauthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OauthSession_state_key" ON "OauthSession"("state");

-- CreateIndex
CREATE INDEX "OauthSession_expiresAt_idx" ON "OauthSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "OauthSession" ADD CONSTRAINT "OauthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
