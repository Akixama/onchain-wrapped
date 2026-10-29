import { redirect } from "next/navigation";

// The wallet quiz was removed; old quiz links go to the Wrapped itself.
export default async function Page(props: PageProps<"/q/[id]">) {
  const { id } = await props.params;
  redirect(`/w/${id}`);
}
