-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recoveryCodes" TEXT,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "userAgent" TEXT,
    "ipHash" TEXT,
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "network_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "credentials" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "lastSyncAt" DATETIME,
    "lastSyncStatus" TEXT,
    "lastSyncMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "network_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "commission" REAL NOT NULL,
    "commissionEur" REAL NOT NULL,
    "saleAmount" REAL NOT NULL DEFAULT 0,
    "saleAmountEur" REAL NOT NULL DEFAULT 0,
    "programId" TEXT,
    "programName" TEXT,
    "countryCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "network_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "daily_stats_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "network_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "network" TEXT,
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "itemsUpserted" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "sync_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sync_runs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "network_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "currency" TEXT NOT NULL PRIMARY KEY,
    "rate" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "network_accounts_userId_idx" ON "network_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "network_accounts_userId_network_label_key" ON "network_accounts"("userId", "network", "label");

-- CreateIndex
CREATE INDEX "transactions_accountId_occurredAt_idx" ON "transactions"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "transactions_day_idx" ON "transactions"("day");

-- CreateIndex
CREATE INDEX "transactions_network_day_idx" ON "transactions"("network", "day");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_accountId_externalId_key" ON "transactions"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "daily_stats_day_idx" ON "daily_stats"("day");

-- CreateIndex
CREATE UNIQUE INDEX "daily_stats_accountId_day_key" ON "daily_stats"("accountId", "day");

-- CreateIndex
CREATE INDEX "sync_runs_userId_startedAt_idx" ON "sync_runs"("userId", "startedAt");

