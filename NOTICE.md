# Third-party content

This repository's code is MIT-licensed (see `LICENSE`). It does not include
Microsoft's documentation. `npm run fetch-corpus` downloads it at setup time:

- **Source:** [MicrosoftDocs/power-platform](https://github.com/MicrosoftDocs/power-platform),
  pinned to commit `9c3eda67de8a57bde78c21021f30029daca66e1d` (see `scripts/corpus-manifest.ts`)
- **Author:** Microsoft Corporation and contributors
- **License:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- **Changes made:** pages are split into sections, and markup, images, videos and link lists are stripped for search.
  Every search result links back to the original page on learn.microsoft.com.

This project is not affiliated with or endorsed by Microsoft. Microsoft, Power Platform
and Copilot Studio are trademarks of the Microsoft group of companies.

The embedding model, [bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5)
(MIT, via the [Xenova ONNX conversion](https://huggingface.co/Xenova/bge-small-en-v1.5)),
is downloaded from Hugging Face on first use.
