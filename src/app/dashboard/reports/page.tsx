import { redirect } from "next/navigation";

// The old shared /dashboard/reports?tab=... page is retired — split into
// four dedicated pages (see ./inventory, ./sales, ./accounts, ./courier)
// after an unresolved bug where the browser reliably rendered the wrong
// tab despite provably-correct server output, reproducing across multiple
// browsers and incognito. Separate real routes sidestep that class of
// problem entirely rather than continuing to chase it. This redirect just
// covers anyone with the old URL bookmarked.
export default function ReportsRedirect() {
  redirect("/dashboard/reports/inventory");
}
