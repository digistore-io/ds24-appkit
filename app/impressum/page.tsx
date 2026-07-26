// The impressum page. Everything is in the shared component — see it for why each
// legal page is its own static route rather than one dynamic `[slug]`.
import { LegalPage, legalMetadata } from "@/components/legal-page";

export const generateMetadata = () => legalMetadata("impressum");

export default function Page() {
  return <LegalPage slug="impressum" />;
}
