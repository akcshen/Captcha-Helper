package com.captcha.helper.dataset;

import com.google.code.kaptcha.impl.DefaultKaptcha;
import com.google.code.kaptcha.util.Config;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.BufferedWriter;
import java.io.File;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Properties;

import static com.google.code.kaptcha.Constants.KAPTCHA_BORDER;
import static com.google.code.kaptcha.Constants.KAPTCHA_BORDER_COLOR;
import static com.google.code.kaptcha.Constants.KAPTCHA_IMAGE_HEIGHT;
import static com.google.code.kaptcha.Constants.KAPTCHA_IMAGE_WIDTH;
import static com.google.code.kaptcha.Constants.KAPTCHA_NOISE_COLOR;
import static com.google.code.kaptcha.Constants.KAPTCHA_NOISE_IMPL;
import static com.google.code.kaptcha.Constants.KAPTCHA_OBSCURIFICATOR_IMPL;
import static com.google.code.kaptcha.Constants.KAPTCHA_SESSION_CONFIG_KEY;
import static com.google.code.kaptcha.Constants.KAPTCHA_TEXTPRODUCER_CHAR_LENGTH;
import static com.google.code.kaptcha.Constants.KAPTCHA_TEXTPRODUCER_CHAR_SPACE;
import static com.google.code.kaptcha.Constants.KAPTCHA_TEXTPRODUCER_FONT_COLOR;
import static com.google.code.kaptcha.Constants.KAPTCHA_TEXTPRODUCER_FONT_NAMES;
import static com.google.code.kaptcha.Constants.KAPTCHA_TEXTPRODUCER_FONT_SIZE;
import static com.google.code.kaptcha.Constants.KAPTCHA_TEXTPRODUCER_IMPL;

/**
 * 最小导出工具：样式对齐 obd-server CaptchaConfig#getKaptchaBeanMath。
 *
 * <pre>
 *   cd tools/kaptcha-dataset
 *   mvn -q compile exec:java -Dexec.args="5000 ../../captcha-dataset"
 * </pre>
 */
public class ExportKaptchaDataset {

    public static void main(String[] args) throws Exception {
        int count = args.length > 0 ? Integer.parseInt(args[0]) : 5000;
        File root = new File(args.length > 1 ? args[1] : "captcha-dataset").getAbsoluteFile();
        File imagesDir = new File(root, "images");
        Files.createDirectories(imagesDir.toPath());

        DefaultKaptcha kaptcha = buildMathKaptcha();
        File labelsFile = new File(root, "labels.txt");
        File answersFile = new File(root, "answers.txt");

        try (
            BufferedWriter labels = new BufferedWriter(
                new OutputStreamWriter(Files.newOutputStream(labelsFile.toPath()), StandardCharsets.UTF_8));
            BufferedWriter answers = new BufferedWriter(
                new OutputStreamWriter(Files.newOutputStream(answersFile.toPath()), StandardCharsets.UTF_8))
        ) {
            for (int i = 1; i <= count; i++) {
                String capText = kaptcha.createText();
                int at = capText.lastIndexOf('@');
                if (at < 0) {
                    throw new IllegalStateException("unexpected captcha text: " + capText);
                }
                String formula = capText.substring(0, at);
                String answer = capText.substring(at + 1);

                String name = String.format("%06d.jpg", i);
                BufferedImage image = kaptcha.createImage(formula);
                ImageIO.write(image, "jpg", new File(imagesDir, name));

                labels.write(name + "\t" + formula);
                labels.newLine();
                answers.write(name + "\t" + answer);
                answers.newLine();

                if (i % 500 == 0 || i == count) {
                    System.out.println("generated " + i + "/" + count);
                }
            }
        }

        System.out.println("done.");
        System.out.println("dataset: " + root.getAbsolutePath());
        System.out.println("next: copy this folder to GPU PC, then:");
        System.out.println("  python app.py cache obd_math <dataset> file");
    }

    static DefaultKaptcha buildMathKaptcha() {
        DefaultKaptcha defaultKaptcha = new DefaultKaptcha();
        Properties properties = new Properties();
        properties.setProperty(KAPTCHA_BORDER, "yes");
        properties.setProperty(KAPTCHA_BORDER_COLOR, "105,179,90");
        properties.setProperty(KAPTCHA_TEXTPRODUCER_FONT_COLOR, "blue");
        properties.setProperty(KAPTCHA_IMAGE_WIDTH, "160");
        properties.setProperty(KAPTCHA_IMAGE_HEIGHT, "60");
        properties.setProperty(KAPTCHA_TEXTPRODUCER_FONT_SIZE, "35");
        properties.setProperty(KAPTCHA_SESSION_CONFIG_KEY, "kaptchaCodeMath");
        properties.setProperty(KAPTCHA_TEXTPRODUCER_IMPL, "com.captcha.helper.dataset.KaptchaTextCreator");
        properties.setProperty(KAPTCHA_TEXTPRODUCER_CHAR_SPACE, "3");
        properties.setProperty(KAPTCHA_TEXTPRODUCER_CHAR_LENGTH, "6");
        properties.setProperty(KAPTCHA_TEXTPRODUCER_FONT_NAMES, "Arial,Courier");
        properties.setProperty(KAPTCHA_NOISE_COLOR, "white");
        properties.setProperty(KAPTCHA_NOISE_IMPL, "com.google.code.kaptcha.impl.NoNoise");
        properties.setProperty(KAPTCHA_OBSCURIFICATOR_IMPL, "com.google.code.kaptcha.impl.ShadowGimpy");
        defaultKaptcha.setConfig(new Config(properties));
        return defaultKaptcha;
    }
}
