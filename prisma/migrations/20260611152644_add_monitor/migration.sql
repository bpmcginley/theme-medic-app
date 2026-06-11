-- CreateTable
CREATE TABLE "ScanSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "findings" INTEGER NOT NULL,
    "deadBytes" INTEGER NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MonitorConfig" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "alertEmail" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ScanSnapshot_shop_createdAt_idx" ON "ScanSnapshot"("shop", "createdAt");
