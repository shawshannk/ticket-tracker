import type { CommentWithAuthor } from '@ticket-tracker/shared';
import { useState } from 'react';
import { useAddComment } from '../../api/queries';
import { relativeTime } from '../../components/relativeTime';
import { useAuth } from '../../auth/AuthProvider';
import { initials } from '../../layout/useDismissable';

/**
 * Activity feed + add box. R6: the author is never sent — the server takes it from the
 * authenticated user, fixing the prototype's hardcoded "Jordan Lee". The avatar below is only a
 * preview of who the server will record, and now it cannot be wrong: it is the signed-in person.
 */
export function Comments({
  ticketId,
  projectId,
  comments,
}: {
  ticketId: string;
  projectId: string;
  comments: CommentWithAuthor[];
}) {
  const [body, setBody] = useState('');
  const addComment = useAddComment(ticketId, projectId);
  const { user } = useAuth();

  const submit = () => {
    const text = body.trim();
    if (!text || addComment.isPending) return;
    addComment.mutate({ body: text }, { onSuccess: () => setBody('') });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3.5 text-[11.5px] font-semibold uppercase tracking-[0.4px] text-slate-400">
        Activity ({comments.length})
      </h2>

      {comments.map((comment) => (
        <div key={comment.id} className="mb-4 flex gap-2.5">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
            {initials(comment.author.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-baseline gap-2">
              <span className="text-[12.5px] font-semibold text-slate-800">{comment.author.name}</span>
              <span className="text-[11px] text-slate-400">{relativeTime(comment.createdAt)}</span>
            </div>
            <div className="whitespace-pre-wrap text-[13px] leading-[1.5] text-slate-700">{comment.body}</div>
          </div>
        </div>
      ))}

      <div className="mt-1.5 flex gap-2.5">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-700 text-[11px] font-bold text-white">
          {user ? initials(user.name) : '··'}
        </span>
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            className="min-h-[56px] w-full resize-y rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-indigo-300"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!body.trim() || addComment.isPending}
            className="mt-2 rounded-[7px] bg-indigo-600 px-3.5 py-[7px] text-[12.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {addComment.isPending ? 'Posting…' : 'Comment'}
          </button>
          {addComment.isError && (
            <p className="mt-1.5 text-[12px] text-rose-700">{(addComment.error as Error).message}</p>
          )}
        </div>
      </div>
    </section>
  );
}
