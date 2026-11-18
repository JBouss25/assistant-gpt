# assistant-gpt

Assistant IA pour la physique-chimie (Terminale, France). L'assistant guide l'élève par des questions et des indices, sans donner directement les réponses aux exercices.

Déploiement visé : https://iaoosted.oostudy.ma

## Stack

- Python 3, [Streamlit](https://streamlit.io) pour l'interface de chat
- [OpenAI](https://platform.openai.com) (API Chat Completions)

## Installation locale

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...          # ou .streamlit/secrets.toml
streamlit run app.py
```

Variables optionnelles :

- `OPENAI_MODEL` : modèle utilisé (défaut `gpt-4o-mini`)

Ne jamais committer la clé API : `.streamlit/secrets.toml` et `.env` sont dans `.gitignore`.
