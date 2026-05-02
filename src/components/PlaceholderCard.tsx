/**
 * Reusable "this section isn't built yet" card. Used on every screen
 * during early sessions so navigation works end-to-end before the real
 * content lands.
 */

export default function PlaceholderCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </div>
  );
}
