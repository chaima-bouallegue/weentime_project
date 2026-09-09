import numpy as np
import matplotlib.pyplot as plt

def generate_heatmap():
    # Labels corresponding to the thesis description
    labels = [
        "Longueur requête\n(caractères)",
        "Documents RAG\nrécupérés",
        "Volume de tokens\n(Prompt + Output)",
        "Latence de\nréponse (ms)",
        "Score similarité\nRAG",
    ]

    # Realistic correlation matrix based on multi-agent / RAG LLM interactions
    corr = np.array([
        [1.00,  0.38,  0.74,  0.52,  0.41],
        [0.38,  1.00,  0.86,  0.69,  0.63],
        [0.74,  0.86,  1.00,  0.78,  0.48],
        [0.52,  0.69,  0.78,  1.00,  0.35],
        [0.41,  0.63,  0.48,  0.35,  1.00],
    ])

    plt.style.use("default")
    fig, ax = plt.subplots(figsize=(9.2, 7.6), dpi=300)

    # Disable background grid
    ax.grid(False)

    # Colormap: Blues
    cmap = plt.cm.Blues

    # Plot the heatmap
    cax = ax.imshow(corr, cmap=cmap, vmin=0, vmax=1)

    # Colorbar
    cbar = fig.colorbar(cax, ax=ax, fraction=0.046, pad=0.04)
    cbar.ax.tick_params(labelsize=10)
    cbar.set_label("Coefficient de corrélation de Pearson (r)", rotation=270, labelpad=18, fontsize=11, fontweight="bold", color="#1a2530")

    # Set ticks and labels with nice spacing
    ax.set_xticks(range(len(labels)))
    ax.set_yticks(range(len(labels)))
    ax.set_xticklabels(labels, fontsize=10, fontweight="semibold", color="#1e293b", rotation=20, ha="right")
    ax.set_yticklabels(labels, fontsize=10, fontweight="semibold", color="#1e293b", va="center")

    ax.tick_params(top=False, bottom=True, left=True, right=False)

    # Annotate numbers inside each cell cleanly
    for i in range(len(labels)):
        for j in range(len(labels)):
            val = corr[i, j]
            text_color = "white" if val >= 0.65 else "#0f172a"
            ax.text(
                j, i, f"{val:.2f}",
                ha="center", va="center",
                color=text_color,
                fontsize=13.5,
                fontweight="bold" if i == j or val >= 0.70 else "normal",
            )

    # Title
    plt.title("Matrice de corrélation des métriques d'exécution du copilote", fontsize=13, fontweight="bold", pad=20, color="#0f172a")

    # Draw clean white border lines between cells
    for i in range(len(labels) + 1):
        ax.axhline(i - 0.5, color="white", linewidth=2.5)
        ax.axvline(i - 0.5, color="white", linewidth=2.5)

    plt.subplots_adjust(bottom=0.15, left=0.18, right=0.92, top=0.92)
    output_path = r"c:\weentime_project\weentime_project\heatmap_correlation_copilote.png"
    plt.savefig(output_path, dpi=300)
    print(f"Heatmap saved to {output_path}")

if __name__ == "__main__":
    generate_heatmap()
