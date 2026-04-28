import com.weentime.weentimeapp.enums.StatutDemandeEnum;

public class EnumProbe {
  public static void main(String[] args) {
    try {
      System.out.println(StatutDemandeEnum.fromValue("EN_ATTENTE"));
    } catch (Exception e) {
      System.out.println(e.getClass().getName() + ": " + e.getMessage());
    }
  }
}
