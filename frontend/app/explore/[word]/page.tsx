'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { api } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import FadeTransition from '@/components/FadeTransition';
import type { Session, SessionGraph } from '@/types/word';
import EtymologyCard from '@/components/EtymologyCard';
import WordGraph from '@/components/WordGraph';

export default function ExplorePage() {
  const params = useParams();
  const word = params.word as string;
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [graph, setGraph] = useState<SessionGraph['graph'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  useEffect(() => {
    if (!word) return;

    const initSession = async () => {
      try {
        // Create a new session
        const newSession = await api.createSession(`Exploring: ${word}`);

        // Add the initial word
        await api.addWordToSession(String(newSession.id), word);

        // Get the updated session
        const updatedSession = await api.getSession(String(newSession.id));
        setSession(updatedSession);

        // Get the graph
        const graphData = await api.getSessionGraph(String(newSession.id));
        setGraph(graphData.graph);

        setSelectedWord(word);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start exploration');
      } finally {
        setLoading(false);
      }
    };

    initSession();
  }, [word]);

  const handleExploreWord = async (newWord: string, parentId?: string) => {
    if (!session) return;

    try {
      await api.addWordToSession(String(session.id), newWord, parentId);

      // Refresh session and graph
      const updatedSession = await api.getSession(String(session.id));
      setSession(updatedSession);

      const graphData = await api.getSessionGraph(String(session.id));
      setGraph(graphData.graph);

      setSelectedWord(newWord);
    } catch (err) {
      console.error('Failed to add word:', err);
    }
  };

  const selectedWordData = session?.words.find(
    (sw) => sw.word.word === selectedWord
  )?.word;

  if (loading) {
    return (
      <FadeTransition show={loading} className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </FadeTransition>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Search
        </button>

        {session && (
          <a
            href={api.getExportUrl(String(session.id), 'md')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </a>
        )}
      </div>

      {/* Session Info */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          {session?.name || 'Etymology Exploration'}
        </h1>
        <p className="text-sm text-gray-500">
          {session?.words.length || 0} words explored
        </p>
      </div>

      {/* Graph */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Exploration Graph
        </h2>
        {graph && (
          <WordGraph
            nodes={graph.nodes}
            edges={graph.edges}
            onNodeClick={(node) => setSelectedWord(node.word)}
          />
        )}
      </div>

      {/* Selected Word Details */}
      {selectedWordData && (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-4 border-b">
            <h2 className="text-2xl font-bold text-gray-900 capitalize">
              {selectedWordData.word}
            </h2>
          </div>
          <EtymologyCard etymology={selectedWordData.etymology} />
        </div>
      )}

      {/* Word List */}
      <div className="mt-6 bg-white rounded-xl shadow-sm border p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Explored Words</h3>
        <div className="flex flex-wrap gap-2">
          {session?.words.map((sw) => (
            <button
              key={sw.id}
              onClick={() => setSelectedWord(sw.word.word)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedWord === sw.word.word
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {sw.word.word}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
