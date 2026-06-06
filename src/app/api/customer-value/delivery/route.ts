import { NextResponse } from "next/server";
import {
  CUSTOMER_VALUE_DELIVERY_VERSION,
  getCustomerValueDeliveryMap,
} from "@/lib/customer-value-delivery";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    version: CUSTOMER_VALUE_DELIVERY_VERSION,
    generatedAt: new Date().toISOString(),
    canonicalStandard: "https://github.com/sovereignsquad/general-design-system/issues/81",
    deliverables: getCustomerValueDeliveryMap(),
  });
}
