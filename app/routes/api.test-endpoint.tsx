import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  return json({ message: "Test endpoint working!", method: "GET" });
}

export async function action({ request }: ActionFunctionArgs) {
  return json({ message: "Test endpoint working!", method: "POST" });
} 