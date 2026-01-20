'use client';

import type { Etymology } from '@/types/word';
import { BookOpen, GitBranch, ArrowRight, Layers, Copy } from 'lucide-react';

interface EtymologyCardProps {
  etymology: Etymology | null;
}

export default function EtymologyCard({ etymology }: EtymologyCardProps) {
  if (!etymology) {
    return (
      <div className="p-6 text-center text-gray-500">
        No etymology information available yet.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Origin */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-primary-500" />
          Origin
        </h3>
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium">
              {etymology.origin.language}
            </span>
            <span className="text-gray-600">→</span>
            <span className="font-mono text-lg text-gray-900">
              {etymology.origin.root}
            </span>
          </div>
        </div>
      </div>

      {/* Components */}
      {etymology.origin.components?.filter(c => c.part !== '-').length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <GitBranch className="w-5 h-5 text-primary-500" />
            Word Components
          </h3>
          <div className="grid gap-3">
            {etymology.origin.components.filter(c => c.part !== '-').map((component, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
              >
                <span className="font-mono text-primary-600 font-semibold min-w-[100px]">
                  {component.part}
                </span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-700">{component.meaning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evolution */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <ArrowRight className="w-5 h-5 text-primary-500" />
          Evolution
        </h3>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-gray-700 font-mono text-sm">
            {typeof etymology.evolution === 'string'
              ? etymology.evolution
              : etymology.evolution.path}
          </p>
          {typeof etymology.evolution === 'object' && etymology.evolution.explanation && (
            <p className="text-gray-600 text-sm mt-2">
              {etymology.evolution.explanation}
            </p>
          )}
        </div>
      </div>

      {/* Semantic Evolution (Polysemy) - Only show if 2+ senses exist */}
      {etymology.senses && etymology.senses.length >= 2 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Layers className="w-5 h-5 text-primary-500" />
            의미 분화
          </h3>
          <div className="relative">
            {/* Root indicator */}
            <div className="flex items-center gap-2 mb-4 p-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
              <span className="font-mono text-orange-700 font-semibold">
                {etymology.origin.root}
              </span>
              <span className="text-gray-500 text-sm">
                ({etymology.origin.rootMeaning || etymology.originalMeaning})
              </span>
            </div>

            {/* Senses tree */}
            <div className="ml-4 border-l-2 border-gray-200 pl-4 space-y-3">
              {etymology.senses.map((sense, index) => (
                <div
                  key={index}
                  className="relative p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Branch connector */}
                  <div className="absolute -left-[21px] top-1/2 w-4 h-0.5 bg-gray-200" />

                  {/* Domain badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                      {sense.domain}
                    </span>
                  </div>

                  {/* Meaning */}
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-lg font-semibold text-gray-900">
                      {sense.meaning}
                    </span>
                    <span className="text-gray-500 text-sm">
                      ({sense.english})
                    </span>
                  </div>

                  {/* Metaphorical extension */}
                  <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded p-2">
                    <span className="text-orange-600">↳</span>
                    <span className="italic">{sense.metaphoricalExtension}</span>
                  </div>

                  {/* Example */}
                  {sense.example && (
                    <div className="mt-2 text-sm text-gray-500 border-t border-gray-100 pt-2">
                      <p className="font-mono text-xs text-gray-700">&quot;{sense.example.english}&quot;</p>
                      <p className="text-gray-500">{sense.example.translation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Meanings */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
          <h4 className="text-sm font-semibold text-amber-800 mb-2">
            Original Meaning
          </h4>
          <p className="text-amber-900">{etymology.originalMeaning}</p>
        </div>
        <div className="p-4 bg-green-50 rounded-lg border border-green-100">
          <h4 className="text-sm font-semibold text-green-800 mb-2">
            Modern Meaning
          </h4>
          <p className="text-green-900">{etymology.modernMeaning}</p>
        </div>
      </div>

      {/* Synonyms */}
      {etymology.synonyms && etymology.synonyms.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Copy className="w-5 h-5 text-primary-500" />
            동의어
          </h3>
          <div className="grid gap-3">
            {etymology.synonyms.map((synonym, index) => (
              <div
                key={index}
                className="p-4 bg-purple-50 rounded-lg border border-purple-100"
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-mono text-purple-700 font-semibold">
                    {synonym.word}
                  </span>
                  <span className="text-purple-600 text-sm">
                    {synonym.meaning}
                  </span>
                </div>
                <p className="text-sm text-gray-600 italic">
                  {synonym.nuance}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
