'use client';

import type { Etymology } from '@/types/word';
import { BookOpen, GitBranch, ArrowRight } from 'lucide-react';

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
      {etymology.origin.components?.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <GitBranch className="w-5 h-5 text-primary-500" />
            Word Components
          </h3>
          <div className="grid gap-3">
            {etymology.origin.components.map((component, index) => (
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
            {etymology.evolution}
          </p>
        </div>
      </div>

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
    </div>
  );
}
