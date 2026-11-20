-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'cs',
ADD COLUMN     "price_mode" TEXT NOT NULL DEFAULT 'withVat',
ADD COLUMN     "product_settings" JSONB NOT NULL DEFAULT '{}';
