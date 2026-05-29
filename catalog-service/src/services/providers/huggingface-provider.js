import axios from 'axios';
import { config } from '../../config/env.js';
import { trimText } from '../../utils/text-utils.js';

const parseHuggingFaceResponse = (data) => {
  if (data?.error) {
    throw new Error(data.error);
  }

  if (Array.isArray(data) && data.every((item) => item?.label && typeof item.score === 'number')) {
    return data.map((item) => ({ label: item.label, score: item.score }));
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (Array.isArray(payload?.labels) && Array.isArray(payload?.scores)) {
    return payload.labels.map((label, index) => ({
      label,
      score: payload.scores[index]
    }));
  }

  return [];
};

export class HuggingFaceProvider {
  constructor() {
    this.name = config.ai.provider;
    this.model = config.ai.huggingFaceModel;
    this.apiToken = config.ai.huggingFaceApiToken;
  }

  get isAvailable() {
    return Boolean(this.apiToken);
  }

  async rank({ interest, candidateLabels }) {
    const response = await axios.post(
      `https://router.huggingface.co/hf-inference/models/${this.model}`,
      {
        inputs: trimText(interest, 300),
        parameters: {
          candidate_labels: candidateLabels,
          multi_label: false,
          hypothesis_template: 'Este libro trata sobre {}.'
        }
      },
      {
        timeout: 15000,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const parsed = parseHuggingFaceResponse(response.data);
    const sorted = [...parsed].sort((a, b) => b.score - a.score);
    return {
      labels: sorted.map((r) => r.label),
      scores: sorted.map((r) => r.score),
    };
  }
}
