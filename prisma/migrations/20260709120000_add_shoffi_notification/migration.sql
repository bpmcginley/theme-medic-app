-- CreateTable
CREATE TABLE "ShoffiNotification" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "notifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
