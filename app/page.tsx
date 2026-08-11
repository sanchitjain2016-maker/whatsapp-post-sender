import type { Metadata } from "next";
import { WhatsAppBroadcaster } from "./whatsapp-broadcaster";

export const metadata: Metadata = {
  title: "WhatsApp Post Sender",
  description: "Upload Excel contacts, personalize a post, and send it on WhatsApp.",
};

export default function Home() {
  return <WhatsAppBroadcaster />;
}
