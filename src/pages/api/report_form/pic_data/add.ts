import type { APIContext } from "astro";
import { apiresult_to_status, create_response_json, create_response_status, del_cache, record_activity, verify_user_data_token } from "../../../../utils/api_helper";
import { prisma } from "../../../../utils/db";
import { ActivityType, Prisma } from "@prisma/client";
import { account_to_api_privillage, AccountAPIPrivillage, Campus } from "../../../../types/variables";
import { z } from "zod";

// A new room (location) with its PIC. `location` is globally unique.
const AddRoomBodyType = z.object({
  location: z.string().trim().min(1).max(191),
  campus_name: z.nativeEnum(Campus),
  pic_name: z.string().trim().min(1).max(191)
});

export async function POST({ request, cookies, clientAddress }: APIContext) {
  //? Verify user token
  const user_token = cookies.get("user_token")?.value;
  const [verification_result, verification_output, user_data] = await verify_user_data_token(user_token ?? "");
  if (!verification_result) {
    return apiresult_to_status(verification_output);
  }

  //? Verify user role
  if (!account_to_api_privillage[user_data.role].includes(AccountAPIPrivillage.CreatePIC)) {
    return create_response_status(401);
  }

  //? Verify request body
  const parsed_body = AddRoomBodyType.safeParse(await request.json().catch(() => null));
  if (!parsed_body.success) {
    return create_response_status(400);
  }

  //? Record Activity (before mutating data, so a failure here never leaves a half-reported success)
  try {
    await record_activity({
      ip_address: clientAddress,
      url: request.url,
      activity_type: ActivityType.CreatePIC,
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

  //? Create the room
  let created_location;
  try {
    created_location = await prisma.report_Location.create({ data: parsed_body.data });
  }
  catch (err) {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      return create_response_status(503);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return create_response_status(409); // Room name already exists
    }
    console.error(`There's an error when trying to create room data: ${err}`);
    return create_response_status(500);
  }

  //? Invalidate cached room list
  await del_cache("cached-location-data");

  return create_response_json(created_location);
}
