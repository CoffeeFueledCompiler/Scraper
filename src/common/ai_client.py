"""Thin wrapper around the OpenAI SDK: model choice, retry/backoff, cost tracking."""

import json
import os

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_random_exponential

DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

# Rough per-1M-token prices (USD) for cost estimate logging. Update if pricing changes.
_PRICES = {"gpt-4o-mini": (0.15, 0.60)}


class AIClient:
    def __init__(self, model=DEFAULT_MODEL):
        self.model = model
        self.client = OpenAI()
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.calls = 0

    @retry(wait=wait_random_exponential(min=1, max=30), stop=stop_after_attempt(4))
    def _call(self, system_prompt, user_prompt):
        return self.client.chat.completions.create(
            model=self.model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )

    def generate_json(self, system_prompt, user_prompt, required_keys):
        """Call the model and parse a JSON response. Returns dict or None if
        the response doesn't parse or is missing required keys."""
        response = self._call(system_prompt, user_prompt)
        self.calls += 1
        usage = response.usage
        if usage:
            self.prompt_tokens += usage.prompt_tokens
            self.completion_tokens += usage.completion_tokens

        content = response.choices[0].message.content
        try:
            data = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            return None
        if not all(k in data for k in required_keys):
            return None
        return data

    def print_usage(self):
        cost = None
        if self.model in _PRICES:
            in_price, out_price = _PRICES[self.model]
            cost = (self.prompt_tokens / 1_000_000) * in_price + (
                self.completion_tokens / 1_000_000
            ) * out_price
        cost_str = f", est. cost ${cost:.4f}" if cost is not None else ""
        print(
            f"AI usage: {self.calls} calls, {self.prompt_tokens} prompt tokens, "
            f"{self.completion_tokens} completion tokens{cost_str}"
        )
