import type { APIContext } from "astro";
import { apiresult_to_status, create_response_json, create_response_status, del_cache, process_server_token, record_activity, verify_user_data_token } from "../../../../utils/api_helper";
import { prisma } from "../../../../utils/db";
import { ActivityType, Prisma } from "@prisma/client";
import { account_to_api_privillage, AccountAPIPrivillage } from "../../../../types/variables";
import { z } from "zod";

const DeleteRoomBodyType = z.object({
  id: z.string().trim().min(1)
});

export async function DELETE({ request, cookies, clientAddress }: APIContext) {
  //? Verify user token
  const user_token = cookies.get("user_token")?.value;
  const [verification_result, verification_output, user_data] = await verify_user_data_token(user_token ?? "");
  if (!verification_result) {
    return apiresult_to_status(verification_output);
  }

  //? Verify user role
  if (!account_to_api_privillage[user_data.role].includes(AccountAPIPrivillage.DeletePIC)) {
    return create_response_status(401);
  }

  //? Verify request body
  const parsed_body = DeleteRoomBodyType.safeParse(await request.json().catch(() => null));
  if (!parsed_body.success) {
    return create_response_status(400);
  }
  const { id } = parsed_body.data;

  //? Get the room and the images of its reports (needed after the rows are gone)
  let room;
  try {
    room = await prisma.report_Location.findUnique({
      where: { id },
      include: { reports_location: { select: { image: true, image_after_finish: true } } }
    });
  }
  catch (err) {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      return create_response_status(503);
    }
    console.error(`There's an error when trying to get room data: ${err}`);
    return create_response_status(500);
  }
  if (!room) {
    return create_response_status(404);
  }

  //? Record Activity (before mutating data, so a failure here never leaves a half-reported success)
  try {
    await record_activity({
      ip_address: clientAddress,
      url: request.url,
      activity_type: ActivityType.DeletePIC,
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

  //? Delete the room with everything that references it, all-or-nothing.
  // Explicit deletes instead of relying on FKs: in the live DB Report cascades on delete,
  // but UserResponsibleLocation is ON DELETE RESTRICT and would block the room delete.
  let deleted_reports;
  try {
    [, deleted_reports] = await prisma.$transaction([
      prisma.userResponsibleLocation.deleteMany({ where: { location: room.location } }),
      prisma.report.deleteMany({ where: { location_name: room.location } }),
      prisma.report_Location.delete({ where: { id } })
    ]);
  }
  catch (err) {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      return create_response_status(503);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return create_response_status(404); // Deleted concurrently
    }
    console.error(`There's an error when trying to delete room "${room.location}": ${err}`);
    return create_response_status(500);
  }

  //? Invalidate caches holding the room, its reports, or its responsible users
  await del_cache("cached-location-data");
  await del_cache("cached-report-data");
  await del_cache("cached-user-responsible-locations");

  //? Delete report images from the PHP server. Best effort: DB rows are already gone,
  // a failure here only leaves an orphaned file, so log it instead of failing the request.
  const images = room.reports_location.flatMap((report) => [report.image, report.image_after_finish]).filter((image): image is string => Boolean(image));
  const server_token = process_server_token();
  await Promise.all(images.map(async (image_location) => {
    const form_data = new FormData();
    form_data.append("image_location", image_location);
    try {
      const response = await fetch(`${process.env.PHP_SERVER_URL!}/delete_image.php`, {
        method: "POST",
        headers: {
          "Api-Authorization": process.env.PHP_SERVER_AUTHORIZATION!,
          "Cookie": `server_token=${server_token}`
        },
        body: form_data
      });
      if (!response.ok) {
        console.error(`Failed to delete image "${image_location}": ${await response.text()}`);
      }
    }
    catch (err) {
      console.error(`Failed to request image delete "${image_location}": ${err}`);
    }
  }));

  return create_response_json({ id, location: room.location, deleted_reports: deleted_reports.count });
}
