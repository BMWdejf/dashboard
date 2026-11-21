-- CreateTable
CREATE TABLE "shoptet_product_settings" (
    "cenik_id" UUID NOT NULL,
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "stock_auto_sync" BOOLEAN NOT NULL DEFAULT true,
    "safety_buffer" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "shoptet_product_settings_pkey" PRIMARY KEY ("cenik_id")
);

-- AddForeignKey
ALTER TABLE "shoptet_product_settings" ADD CONSTRAINT "shoptet_product_settings_cenik_id_fkey" FOREIGN KEY ("cenik_id") REFERENCES "flexi_cenik"("id") ON DELETE CASCADE ON UPDATE CASCADE;
