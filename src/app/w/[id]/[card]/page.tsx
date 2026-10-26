import { Suspense } from "react";
import { WrappedView, wrappedMetadata } from "@/components/WrappedView";
import { Loading } from "@/components/story/Loading";

// Shared links land here: the story opens on the card that was shared.
export const generateMetadata = (props: PageProps<"/w/[id]/[card]">) => wrappedMetadata(props.params);

export default function Page(props: PageProps<"/w/[id]/[card]">) {
  return (
    <Suspense fallback={<Loading />}>
      <WrappedView params={props.params} />
    </Suspense>
  );
}
