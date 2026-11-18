"""Assistant IA Physique-Chimie (Terminale) - interface Streamlit.

Lancer en local :
    export OPENAI_API_KEY=sk-...
    streamlit run app.py
"""

import os

import streamlit as st
from openai import OpenAI

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

SYSTEM_PROMPT = """Tu es un assistant pédagogique en physique-chimie pour des élèves de Terminale (France).
- Explique les notions de façon progressive, avec des exemples concrets.
- Ne donne pas directement la réponse finale d'un exercice : guide l'élève par des questions et des indices.
- Vérifie la cohérence des unités et des ordres de grandeur.
- Reste bienveillant et encourageant. Réponds en français."""


def get_api_key() -> str | None:
    """Lit la clé depuis l'environnement, sinon depuis st.secrets."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        try:
            key = st.secrets["OPENAI_API_KEY"]
        except (KeyError, FileNotFoundError):
            key = None
    return key


def ask_assistant(client: OpenAI, history: list[dict]) -> str:
    """Envoie l'historique à l'API et retourne la réponse texte."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, *history],
        temperature=0.4,
        max_tokens=800,
    )
    return response.choices[0].message.content or ""


def main() -> None:
    st.set_page_config(page_title="Assistant IA Physique-Chimie", page_icon="🧪")
    st.title("Assistant IA Physique-Chimie")
    st.caption("Terminale - je guide, je n'envoie pas les corrigés.")

    api_key = get_api_key()
    if not api_key:
        st.error("Clé OPENAI_API_KEY absente. Définissez-la dans l'environnement ou dans .streamlit/secrets.toml.")
        st.stop()

    if "history" not in st.session_state:
        st.session_state.history = []

    for message in st.session_state.history:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    question = st.chat_input("Pose ta question de physique-chimie...")
    if question:
        st.session_state.history.append({"role": "user", "content": question})
        with st.chat_message("user"):
            st.markdown(question)

        client = OpenAI(api_key=api_key)
        try:
            with st.chat_message("assistant"):
                with st.spinner("Réflexion..."):
                    answer = ask_assistant(client, st.session_state.history[-10:])
                st.markdown(answer)
            st.session_state.history.append({"role": "assistant", "content": answer})
        except Exception as exc:  # erreur réseau ou API : on informe sans planter
            st.error(f"Erreur lors de l'appel à l'API : {exc}")
            st.session_state.history.pop()


if __name__ == "__main__":
    main()
