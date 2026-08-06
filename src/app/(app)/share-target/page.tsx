import { ShareTargetClient } from "@/components/share-target-client";

export const dynamic = "force-dynamic";

export default function ShareTargetPage() {
  return (
    <div className="py-4">
      <ShareTargetClient />
    </div>
  );
}
