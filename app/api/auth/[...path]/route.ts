import { getAuth } from "@/lib/auth/server";

type Context = RouteContext<"/api/auth/[...path]">;

export const GET = (request: Request, context: Context) =>
  getAuth().handler().GET(request, context);
export const POST = (request: Request, context: Context) =>
  getAuth().handler().POST(request, context);
export const PUT = (request: Request, context: Context) =>
  getAuth().handler().PUT(request, context);
export const DELETE = (request: Request, context: Context) =>
  getAuth().handler().DELETE(request, context);
export const PATCH = (request: Request, context: Context) =>
  getAuth().handler().PATCH(request, context);
