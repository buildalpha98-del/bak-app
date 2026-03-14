"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import type { ProgramContentJson, SkillDrill } from "@/lib/ai/types";

// ============================================================
// ProgramEditor — inline editor for generated programme content
// ============================================================

interface ProgramEditorProps {
  content: ProgramContentJson;
  onChange: (content: ProgramContentJson) => void;
}

/** Split newline-separated text into array, filter empty */
function toArray(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Join array into newline-separated text */
function toText(arr: string[]): string {
  return arr.join("\n");
}

export function ProgramEditor({ content, onChange }: ProgramEditorProps) {
  function update(patch: Partial<ProgramContentJson>) {
    onChange({ ...content, ...patch });
  }

  function updateDrill(index: number, patch: Partial<SkillDrill>) {
    const drills = [...content.skillDevelopment];
    drills[index] = { ...drills[index], ...patch };
    update({ skillDevelopment: drills });
  }

  function addDrill() {
    update({
      skillDevelopment: [
        ...content.skillDevelopment,
        {
          name: "",
          duration: 5,
          description: "",
          progressions: [],
          coachingTips: "",
        },
      ],
    });
  }

  function removeDrill(index: number) {
    const drills = content.skillDevelopment.filter((_, i) => i !== index);
    update({ skillDevelopment: drills });
  }

  return (
    <div className="space-y-6">
      {/* Title & Overview */}
      <Card>
        <CardHeader>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
            Overview
          </h4>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={content.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="objectives">
              Objectives (one per line)
            </Label>
            <Textarea
              id="objectives"
              rows={4}
              value={toText(content.objectives)}
              onChange={(e) => update({ objectives: toArray(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Warm Up */}
      <Card>
        <CardHeader>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
            Warm Up
          </h4>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="warmup-name">Activity name</Label>
              <Input
                id="warmup-name"
                value={content.warmUp.name}
                onChange={(e) =>
                  update({ warmUp: { ...content.warmUp, name: e.target.value } })
                }
              />
            </div>
            <div>
              <Label htmlFor="warmup-duration">Duration (min)</Label>
              <Input
                id="warmup-duration"
                type="number"
                min={1}
                max={15}
                value={content.warmUp.duration}
                onChange={(e) =>
                  update({
                    warmUp: {
                      ...content.warmUp,
                      duration: parseInt(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="warmup-desc">Description</Label>
            <Textarea
              id="warmup-desc"
              rows={3}
              value={content.warmUp.description}
              onChange={(e) =>
                update({
                  warmUp: { ...content.warmUp, description: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="warmup-tips">Coaching tips</Label>
            <Textarea
              id="warmup-tips"
              rows={2}
              value={content.warmUp.coachingTips}
              onChange={(e) =>
                update({
                  warmUp: { ...content.warmUp, coachingTips: e.target.value },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Skill Development */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
              Skill Development
            </h4>
            <Button type="button" variant="outline" size="sm" onClick={addDrill}>
              <Plus className="mr-1 h-3 w-3" />
              Add drill
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {content.skillDevelopment.map((drill, i) => (
            <div
              key={i}
              className="rounded-lg border border-border p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  Drill {i + 1}
                </p>
                {content.skillDevelopment.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDrill(i)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={drill.name}
                    onChange={(e) => updateDrill(i, { name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Duration (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={drill.duration}
                    onChange={(e) =>
                      updateDrill(i, {
                        duration: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={drill.description}
                  onChange={(e) =>
                    updateDrill(i, { description: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Progressions (one per line)</Label>
                <Textarea
                  rows={3}
                  value={toText(drill.progressions)}
                  onChange={(e) =>
                    updateDrill(i, { progressions: toArray(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>Coaching tips</Label>
                <Textarea
                  rows={2}
                  value={drill.coachingTips}
                  onChange={(e) =>
                    updateDrill(i, { coachingTips: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Modified Game */}
      <Card>
        <CardHeader>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
            Modified Game
          </h4>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Game name</Label>
              <Input
                value={content.modifiedGame.name}
                onChange={(e) =>
                  update({
                    modifiedGame: {
                      ...content.modifiedGame,
                      name: e.target.value,
                    },
                  })
                }
              />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={content.modifiedGame.duration}
                onChange={(e) =>
                  update({
                    modifiedGame: {
                      ...content.modifiedGame,
                      duration: parseInt(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={content.modifiedGame.description}
              onChange={(e) =>
                update({
                  modifiedGame: {
                    ...content.modifiedGame,
                    description: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Rules (one per line)</Label>
            <Textarea
              rows={3}
              value={toText(content.modifiedGame.rules)}
              onChange={(e) =>
                update({
                  modifiedGame: {
                    ...content.modifiedGame,
                    rules: toArray(e.target.value),
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Variations (one per line)</Label>
            <Textarea
              rows={3}
              value={toText(content.modifiedGame.variations)}
              onChange={(e) =>
                update({
                  modifiedGame: {
                    ...content.modifiedGame,
                    variations: toArray(e.target.value),
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Coaching tips</Label>
            <Textarea
              rows={2}
              value={content.modifiedGame.coachingTips}
              onChange={(e) =>
                update({
                  modifiedGame: {
                    ...content.modifiedGame,
                    coachingTips: e.target.value,
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Cool Down */}
      <Card>
        <CardHeader>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
            Cool Down
          </h4>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Activity name</Label>
              <Input
                value={content.coolDown.name}
                onChange={(e) =>
                  update({
                    coolDown: { ...content.coolDown, name: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={content.coolDown.duration}
                onChange={(e) =>
                  update({
                    coolDown: {
                      ...content.coolDown,
                      duration: parseInt(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={content.coolDown.description}
              onChange={(e) =>
                update({
                  coolDown: {
                    ...content.coolDown,
                    description: e.target.value,
                  },
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
