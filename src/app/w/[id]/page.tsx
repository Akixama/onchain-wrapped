import { Suspense } from "react";
import { WrappedView, wrappedMetadata } from "@/components/WrappedView";
import { Loading } from "@/components/story/Loading";

export const generateMetadata = (props: PageProps<"/w/[id]">) => wrappedMetadata(props.params);

export default function Page(props: PageProps<"/w/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <WrappedView params={props.params} />
    </Suspense>
  );
}
