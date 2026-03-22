import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Image as ImageIcon, Loader2, X } from 'lucide-react';

interface Props {
    onApplyTexture: (target: string, base64: string) => void;
    onClose: () => void;
}

export const TextureGenerator: React.FC<Props> = ({ onApplyTexture, onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [size, setSize] = useState('1K');
    const [target, setTarget] = useState('ground');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        
        try {
            setIsGenerating(true);
            setError('');

            // @ts-ignore
            if (!await window.aistudio.hasSelectedApiKey()) {
                // @ts-ignore
                await window.aistudio.openSelectKey();
            }

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { parts: [{ text: prompt + " seamless texture, high quality, game asset, horror style" }] },
                config: {
                    imageConfig: {
                        aspectRatio: "1:1",
                        imageSize: size as any
                    }
                }
            });

            let base64Image = '';
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    base64Image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    break;
                }
            }

            if (base64Image) {
                onApplyTexture(target, base64Image);
            } else {
                setError('Failed to generate image. No image data returned.');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred during generation.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-emerald-500" />
                        AI Texture Generator
                    </h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Target Object</label>
                        <select 
                            value={target} 
                            onChange={(e) => setTarget(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                        >
                            <option value="ground">Ground / Floor</option>
                            <option value="wood">Booth Wood Walls</option>
                            <option value="metal">Booth Metal Parts</option>
                            <option value="trunk">Tree Trunks</option>
                            <option value="leaves">Tree Leaves</option>
                            <option value="ceramic">Mug</option>
                            <option value="plastic">Radio</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Texture Prompt</label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g. bloody rusted metal, creepy dark wood, fleshy organic matter..."
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 h-24 resize-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Resolution</label>
                        <select 
                            value={size} 
                            onChange={(e) => setSize(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                        >
                            <option value="1K">1K (Fastest)</option>
                            <option value="2K">2K (High Quality)</option>
                            <option value="4K">4K (Ultra Quality)</option>
                        </select>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <button 
                        onClick={handleGenerate}
                        disabled={isGenerating || !prompt.trim()}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            'Generate & Apply Texture'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
