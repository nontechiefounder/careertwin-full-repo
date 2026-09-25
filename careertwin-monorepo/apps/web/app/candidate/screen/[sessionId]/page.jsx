"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, ArrowRight, ArrowLeft, CheckCircle, Send } from "lucide-react";
import { CTLogo } from "@/components/NaiveShell";

export default function CandidateScreenPage({ params }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get(`/candidate/screening-sessions/${sessionId}`);
      setData(res.data);
      // Load existing answers
      const answerMap = {};
      (res.data.answers || []).forEach(a => { answerMap[a.question_id] = a.answer_text; });
      setAnswers(answerMap);
    } catch (err) { toast.error("Failed to load session"); }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const questions = data?.session?.questions || [];
  const session = data?.session;
  const summary = data?.summary;
  const ext = data?.extraction;

  const saveAnswer = async (qId, text) => {
    setSubmitting(true);
    try {
      await api.post(`/candidate/screening-sessions/${sessionId}/answer`, { question_id: qId, answer_text: text });
      // Also start if not started
      if (session?.status === "not_started") {
        await api.post(`/candidate/screening-sessions/${sessionId}/start`);
      }
    } catch (err) { toast.error("Failed to save answer"); }
    finally { setSubmitting(false); }
  };

  const completeScreen = async () => {
    setCompleting(true);
    try {
      await api.post(`/candidate/screening-sessions/${sessionId}/complete`);
      toast.success("Screening completed!");
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to complete");
    } finally { setCompleting(false); }
  };

  if (loading) return (
    <div className="h-screen bg-[#0d0d0d] flex items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-white/20" />
    </div>
  );

  if (session?.status === "completed" && summary) {
    return (
      <div className="min-h-screen bg-[#0d0d0d]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }} data-testid="screen-completed-page">
        <nav className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <CTLogo />
            <span className="text-[13px] font-semibold text-white/85">CareerTWiN</span>
          </div>
          <span className="text-[11px] text-white/35">Screening Complete</span>
        </nav>

        <div className="max-w-xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/[0.15] flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h1 className="text-[16px] font-semibold text-white/85">Screening complete</h1>
              <p className="text-[11px] text-white/35">Your responses have been submitted</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <p className="mono-label">OVERALL FIT</p>
              <span className="text-[22px] font-mono font-semibold text-green-400">{((summary.overall_score || 0) * 100).toFixed(0)}%</span>
            </div>
            <p className="text-[12px] text-white/45 leading-relaxed">{summary.summary_text}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="text-[11px] font-semibold text-white/50 mb-2 flex items-center gap-1.5">
                <CheckCircle className="h-3 w-3 text-green-400" /> Strengths
              </h3>
              <ul className="space-y-1">
                {summary.strengths?.map((s, i) => (
                  <li key={i} className="text-[11px] text-white/35 flex items-start gap-1.5">
                    <span className="text-white/20 mt-0.5">·</span> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h3 className="text-[11px] font-semibold text-white/50 mb-2">Concerns</h3>
              <ul className="space-y-1">
                {summary.concerns?.map((c, i) => (
                  <li key={i} className="text-[11px] text-white/35 flex items-start gap-1.5">
                    <span className="text-white/20 mt-0.5">·</span> {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {summary.recommended_next_step && (
            <div className="rounded-xl border border-green-500/[0.15] bg-green-500/[0.04] p-4 mb-6">
              <p className="mono-label mb-1">NEXT STEP</p>
              <p className="text-[12px] text-white/55">{summary.recommended_next_step}</p>
            </div>
          )}

          <button onClick={() => router.push("/")} className="btn-ghost" data-testid="back-home-btn">
            ← Back to home
          </button>
        </div>
      </div>
    );
  }

  const q = questions[currentQ];
  const progress = questions.length > 0 ? ((Object.keys(answers).length / questions.length) * 100) : 0;
  const allAnswered = questions.every(questionsItem => answers[questionsItem.id]?.trim());

  return (
    <div className="min-h-screen bg-[#0d0d0d]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }} data-testid="screen-page">
      <nav className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <CTLogo />
          <span className="text-[13px] font-semibold text-white/85">CareerTWiN</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-white/35">{ext?.candidate_name || "Screening"}</span>
          <span className="font-mono text-[11px] text-white/50">{currentQ + 1}/{questions.length}</span>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="mono-label">PROGRESS</p>
            <span className="text-[10px] font-mono text-white/30">{Object.keys(answers).length}/{questions.length} answered</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        {q && (
          <div className="animate-fade-in" key={q.id}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.07] text-[9px] font-mono text-white/35 tracking-wider uppercase">{q.dimension}</span>
              <span className="text-[10px] text-white/25">Question {currentQ + 1}</span>
            </div>
            <h2 className="text-[16px] font-medium text-white/80 mb-5 leading-relaxed">{q.question}</h2>

            <textarea
              value={answers[q.id] || ""}
              onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
              placeholder="Write your answer here. Be specific about your experience..."
              rows={8}
              className="naive-input w-full p-3 resize-none text-[12px] leading-relaxed rounded-xl mb-4"
              data-testid="screen-answer-input"
            />

            <div className="flex items-center justify-between">
              <button disabled={currentQ === 0} onClick={() => setCurrentQ(c => c - 1)}
                className="btn-ghost disabled:opacity-30" data-testid="prev-question-btn">
                <ArrowLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <div className="flex gap-2">
                <button onClick={() => saveAnswer(q.id, answers[q.id] || "")} disabled={submitting || !answers[q.id]?.trim()}
                  className="btn-ghost disabled:opacity-30" data-testid="save-answer-btn">
                  {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Save
                </button>
                {currentQ < questions.length - 1 ? (
                  <button className="btn-white disabled:opacity-40"
                    onClick={() => { saveAnswer(q.id, answers[q.id] || ""); setCurrentQ(c => c + 1); }}
                    disabled={!answers[q.id]?.trim()} data-testid="next-question-btn">
                    Next <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button className="btn-white disabled:opacity-40"
                    onClick={completeScreen} disabled={!allAnswered || completing} data-testid="complete-screen-btn">
                    {completing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Complete screening
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Question dots */}
        <div className="flex items-center gap-1.5 mt-8 justify-center">
          {questions.map((questionItem, i) => (
            <button key={i} onClick={() => setCurrentQ(i)}
              className={`w-2 h-2 rounded-full transition-colors ${i === currentQ ? "bg-white" : answers[questionItem.id] ? "bg-green-400" : "bg-white/20"}`}
              data-testid={`question-dot-${i}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
