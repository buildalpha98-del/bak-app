"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { QuizContent, QuizQuestion } from "@/lib/types/database";

interface QuizEditorProps {
  value: QuizContent;
  onChange: (value: QuizContent) => void;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function newQuestion(): QuizQuestion {
  return {
    id: generateId(),
    question: "",
    options: ["", ""],
    correct_answer_index: 0,
    explanation: "",
  };
}

export function QuizEditor({ value, onChange }: QuizEditorProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [previewMode, setPreviewMode]     = useState(false);

  // ── Settings helpers ──────────────────────────────────────────────────────

  function setPassMark(n: number) {
    onChange({ ...value, pass_mark: n });
  }
  function setAllowRetries(b: boolean) {
    onChange({ ...value, allow_retries: b });
  }
  function setMaxRetries(n: number) {
    onChange({ ...value, max_retries: n });
  }
  function setRandomiseOrder(b: boolean) {
    onChange({ ...value, randomise_order: b });
  }

  // ── Question helpers ──────────────────────────────────────────────────────

  function addQuestion() {
    onChange({ ...value, questions: [...value.questions, newQuestion()] });
  }

  function removeQuestion(id: string) {
    onChange({ ...value, questions: value.questions.filter((q) => q.id !== id) });
    setConfirmDelete(null);
  }

  function updateQuestion(id: string, patch: Partial<QuizQuestion>) {
    onChange({
      ...value,
      questions: value.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    });
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const next = [...value.questions];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...value, questions: next });
  }

  function addOption(qId: string) {
    const q = value.questions.find((q) => q.id === qId);
    if (!q || q.options.length >= 4) return;
    updateQuestion(qId, { options: [...q.options, ""] });
  }

  function removeOption(qId: string, optIdx: number) {
    const q = value.questions.find((q) => q.id === qId);
    if (!q || q.options.length <= 2) return;
    const options = q.options.filter((_, i) => i !== optIdx);
    // Adjust correct_answer_index if necessary
    let correct = q.correct_answer_index;
    if (optIdx < correct) correct -= 1;
    if (correct >= options.length) correct = options.length - 1;
    updateQuestion(qId, { options, correct_answer_index: correct });
  }

  function updateOption(qId: string, optIdx: number, text: string) {
    const q = value.questions.find((q) => q.id === qId);
    if (!q) return;
    const options = [...q.options];
    options[optIdx] = text;
    updateQuestion(qId, { options });
  }

  return (
    <div className="space-y-6">
      {/* Settings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="pass-mark">Pass mark (%)</Label>
          <Input
            id="pass-mark"
            type="number"
            min={1}
            max={100}
            value={value.pass_mark}
            onChange={(e) => setPassMark(Number(e.target.value))}
            className="w-32"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="allow-retries"
              checked={value.allow_retries}
              onCheckedChange={(c) => setAllowRetries(Boolean(c))}
            />
            <Label htmlFor="allow-retries" className="cursor-pointer">
              Allow retries
            </Label>
          </div>
          {value.allow_retries && (
            <div className="flex items-center gap-2 pl-6">
              <Label htmlFor="max-retries" className="text-sm whitespace-nowrap">
                Max retries
              </Label>
              <Input
                id="max-retries"
                type="number"
                min={1}
                value={value.max_retries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="w-20"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="randomise-order"
            checked={value.randomise_order}
            onCheckedChange={(c) => setRandomiseOrder(Boolean(c))}
          />
          <Label htmlFor="randomise-order" className="cursor-pointer">
            Randomise question order
          </Label>
        </div>
      </div>

      <hr />

      {/* Questions header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Questions{" "}
          <Badge variant="outline" className="ml-1 font-normal">
            {value.questions.length}
          </Badge>
        </h3>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreviewMode((p) => !p)}
          >
            {previewMode ? (
              <>
                <EyeOff className="h-4 w-4 mr-1" /> Edit
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-1" /> Preview
              </>
            )}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
            <Plus className="h-4 w-4 mr-1" /> Add Question
          </Button>
        </div>
      </div>

      {/* Question list */}
      {value.questions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No questions yet — click "Add Question" to get started.
        </p>
      ) : (
        <div className="space-y-4">
          {value.questions.map((q, qIdx) => (
            <Card key={q.id} className="border-secondary">
              <CardContent className="pt-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-muted-foreground w-6 pt-2 shrink-0">
                    Q{qIdx + 1}
                  </span>
                  <div className="flex-1 space-y-2">
                    {previewMode ? (
                      <p className="text-sm font-medium">
                        {q.question || <span className="italic text-muted-foreground">(no question text)</span>}
                      </p>
                    ) : (
                      <Textarea
                        value={q.question}
                        onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                        placeholder="Enter question text…"
                        rows={2}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={qIdx === 0}
                      onClick={() => moveQuestion(qIdx, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={qIdx === value.questions.length - 1}
                      onClick={() => moveQuestion(qIdx, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    {confirmDelete === q.id ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeQuestion(q.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmDelete(q.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Options */}
                <div className="pl-8 space-y-2">
                  {q.options.map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${q.id}`}
                        checked={q.correct_answer_index === optIdx}
                        onChange={() => updateQuestion(q.id, { correct_answer_index: optIdx })}
                        className="accent-primary shrink-0"
                        title="Mark as correct answer"
                      />
                      {previewMode ? (
                        <span
                          className={`text-sm flex-1 ${
                            q.correct_answer_index === optIdx
                              ? "font-medium text-emerald-700"
                              : ""
                          }`}
                        >
                          {opt || <span className="italic text-muted-foreground">(empty option)</span>}
                        </span>
                      ) : (
                        <Input
                          value={opt}
                          onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
                          placeholder={`Option ${optIdx + 1}`}
                          className="flex-1 h-8"
                        />
                      )}
                      {!previewMode && q.options.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => removeOption(q.id, optIdx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {!previewMode && q.options.length < 4 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs pl-6"
                      onClick={() => addOption(q.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add option
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground pt-1">
                    Select the radio button next to the correct answer.
                  </p>
                </div>

                {/* Explanation */}
                <div className="pl-8 space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Explanation (shown after answering)
                  </Label>
                  {previewMode ? (
                    <p className="text-sm text-muted-foreground italic">
                      {q.explanation || "(no explanation provided)"}
                    </p>
                  ) : (
                    <Textarea
                      value={q.explanation}
                      onChange={(e) => updateQuestion(q.id, { explanation: e.target.value })}
                      placeholder="Explain why the correct answer is right…"
                      rows={2}
                    />
                  )}
                </div>

                {/* Confirm delete prompt */}
                {confirmDelete === q.id && (
                  <div className="pl-8 flex items-center gap-2 text-sm text-destructive">
                    <span>Delete this question?</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => removeQuestion(q.id)}
                    >
                      Yes, delete
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" onClick={addQuestion}>
        <Plus className="h-4 w-4 mr-2" /> Add Question
      </Button>
    </div>
  );
}
