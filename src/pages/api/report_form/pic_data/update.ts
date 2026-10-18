import type { APIContext } from "astro";
import { apiresult_to_status, create_response_json, create_response_status, del_cache, record_activity, verify_user_data_token } from "../../../../utils/api_helper";
import { prisma } from "../../../../utils/db";
import { ActivityType, Prisma } from "@prisma/client";
import { account_to_api_privillage, AccountAPIPrivillage } from "../../../../types/variables";
import { z } from "zod";

// A room (location) can be identified either by its id or by its unique location name.
const UpdateRoomPICBodyType = z.object({
  id: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  pic_name: z.string().trim().min(1).max(191)
}).refine((data) => Boolean(data.id) !== Boolean(data.location), {
  message: "Provide either 'id' or 'location' (exactly one of them).",
  path: ["id"]
});

export async function PUT({ request, cookies, clientAddress }: APIContext) {
  //? Verify user token
  const user_token = cookies.get("user_token")?.value;
  const [verification_result, verification_output, user_data] = await verify_user_data_token(user_token ?? "");
  if (!verification_result) {
    return apiresult_to_status(verification_output);
  }

  //? Verify user role
  if (!account_to_api_privillage[user_data.role].includes(AccountAPIPrivillage.UpdatePIC)) {
    return create_response_status(401);
  }

  //? Verify request body
  const parsed_body = UpdateRoomPICBodyType.safeParse(await request.json().catch(() => null));
  if (!parsed_body.success) {
    return create_response_status(400);
  }
  const { id, location, pic_name } = parsed_body.data;

  //? Record Activity (before mutating data, so a failure here never leaves a half-reported success)
  try {
    await record_activity({
      ip_address: clientAddress,
      url: request.url,
      activity_type: ActivityType.UpdatePIC,
      user_id: user_data.id
    });
  }
  catch (err) {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      return create_response_status(503);
    }
    console.error(`There's an error when trying to add activity record data. Error: ${err}`);
    return create_response_status(500);
  }

  //? Update the PIC of the room.
  // Report rows follow automatically: Report references Report_Location through
  // (location_name, pic_name) and Prisma creates that foreign key with ON UPDATE CASCADE.
  let updated_location;
  try {
    updated_location = await prisma.report_Location.update({
      where: id ? { id } : { location: location! },
      data: { pic_name }
    });
  }
  catch (err) {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      return create_response_status(503);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return create_response_status(404); // Room / location not found
      }
      if (err.code === "P2002") {
        return create_response_status(409); // Unique constraint conflict
      }
      if (err.code === "P2003") {
        console.error(`Cannot update PIC of "${location ?? id}": the Report -> Report_Location foreign key has no ON UPDATE CASCADE. Error: ${err.message}`);
        return create_response_status(409);
      }
    }
    console.error(`There's an error when trying to update room PIC data: ${err}`);
    return create_response_status(500);
  }

  //? Invalidate caches that still hold the old PIC name
  await del_cache("cached-location-data");
  await del_cache("cached-report-data");

  return create_response_json(updated_location);
}
