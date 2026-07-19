package com.weentime.communication.controller;

import com.weentime.communication.config.CommunicationProperties;
import com.weentime.communication.dto.ApiEnvelope;
import com.weentime.communication.dto.AttachmentResponse;
import com.weentime.communication.entity.CommAttachment;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.repository.CommAttachmentRepository;
import com.weentime.communication.security.CommunicationUserPrincipal;
import com.weentime.communication.security.SecurityUtils;
import com.weentime.communication.service.FileStorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class AttachmentControllerTest {

    private FileStorageService fileStorageService;
    private CommAttachmentRepository attachmentRepository;
    private CommunicationProperties properties;
    private CommunicationProperties.Storage storage;
    private AttachmentController controller;
    private MockedStatic<SecurityUtils> securityUtilsMock;

    @BeforeEach
    void setUp() {
        fileStorageService = mock(FileStorageService.class);
        attachmentRepository = mock(CommAttachmentRepository.class);
        properties = mock(CommunicationProperties.class);
        storage = mock(CommunicationProperties.Storage.class);
        when(properties.getStorage()).thenReturn(storage);
        when(storage.getMaxFileSizeMb()).thenReturn(10);
        when(storage.getAllowedTypes()).thenReturn("image/png,image/jpeg,application/pdf");

        controller = new AttachmentController(fileStorageService, attachmentRepository, properties);

        CommunicationUserPrincipal currentUser =
                new CommunicationUserPrincipal(1L, "chaima", 42L, List.of("ROLE_USER"), "test-token");

        securityUtilsMock = mockStatic(SecurityUtils.class);
        securityUtilsMock.when(SecurityUtils::currentUser).thenReturn(currentUser);
    }

    @AfterEach
    void tearDown() {
        securityUtilsMock.close();
    }

    private void mockCurrentUser(Long entrepriseId) {
        CommunicationUserPrincipal user =
                new CommunicationUserPrincipal(1L, "chaima", entrepriseId, List.of("ROLE_USER"), "test-token");
        securityUtilsMock.when(SecurityUtils::currentUser).thenReturn(user);
    }

    private MultipartFile validPngFile() {
        return new MockMultipartFile("files", "photo.png", "image/png", new byte[100]);
    }

    // ---- uploadAttachments ----

    @Test
    void uploadAttachments_withValidFile_savesAndReturnsResponse() {
        MultipartFile file = validPngFile();
        CommAttachment saved = new CommAttachment();
        saved.setId(UUID.randomUUID());
        saved.setFileName("photo.png");
        saved.setOriginalName("photo.png");
        saved.setContentType("image/png");
        saved.setFileSize(100L);

        when(fileStorageService.store(eq(42L), any())).thenReturn("42/photo.png");
        when(attachmentRepository.save(any(CommAttachment.class))).thenReturn(saved);

        ApiEnvelope<List<AttachmentResponse>> result =
                controller.uploadAttachments(List.of(file));

        assertThat(result.data()).hasSize(1);
        assertThat(result.data().get(0).fileName()).isEqualTo("photo.png");
        verify(attachmentRepository).save(any(CommAttachment.class));
    }

    @Test
    void uploadAttachments_withoutEntrepriseId_throwsForbidden() {
        mockCurrentUser(null);

        List<MultipartFile> files = List.of(validPngFile());
        assertThatThrownBy(() -> controller.uploadAttachments(files))
                .isInstanceOf(CommunicationException.class)
                .hasMessageContaining("Tenant ID is required");
    }

    @Test
    void uploadAttachments_withTooManyFiles_throwsBadRequest() {
        List<MultipartFile> files = List.of(
                validPngFile(), validPngFile(), validPngFile(),
                validPngFile(), validPngFile(), validPngFile());

        assertThatThrownBy(() -> controller.uploadAttachments(files))
                .isInstanceOf(CommunicationException.class)
                .hasMessageContaining("Maximum 5 files");
    }

    @Test
    void uploadAttachments_withFileTooLarge_throwsBadRequest() {
        MultipartFile bigFile = new MockMultipartFile(
                "files", "big.png", "image/png", new byte[11 * 1024 * 1024]);

        List<MultipartFile> files = List.of(bigFile);
        assertThatThrownBy(() -> controller.uploadAttachments(files))
                .isInstanceOf(CommunicationException.class)
                .hasMessageContaining("exceeds the maximum size");
    }

    @Test
    void uploadAttachments_withNullContentType_throwsBadRequest() {
        MultipartFile file = new MockMultipartFile("files", "file", null, new byte[10]);

        List<MultipartFile> files = List.of(file);
        assertThatThrownBy(() -> controller.uploadAttachments(files))
                .isInstanceOf(CommunicationException.class)
                .hasMessageContaining("content type is missing");
    }

    @Test
    void uploadAttachments_withDisallowedContentType_throwsBadRequest() {
        MultipartFile file = new MockMultipartFile(
                "files", "script.exe", "application/x-msdownload", new byte[10]);

        List<MultipartFile> files = List.of(file);
        assertThatThrownBy(() -> controller.uploadAttachments(files))
                .isInstanceOf(CommunicationException.class)
                .hasMessageContaining("is not allowed");
    }

    // ---- downloadAttachment ----

    @Test
    void downloadAttachment_withExistingAttachment_returnsResourceInline() {
        UUID id = UUID.randomUUID();
        CommAttachment attachment = new CommAttachment();
        attachment.setId(id);
        attachment.setContentType("image/png");
        attachment.setOriginalName("photo.png");
        attachment.setStoragePath("42/photo.png");

        Resource resource = mock(Resource.class);
        when(attachmentRepository.findByIdAndEntrepriseId(id, 42L))
                .thenReturn(Optional.of(attachment));
        when(fileStorageService.loadAsResource("42/photo.png")).thenReturn(resource);

        var response = controller.downloadAttachment(id);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getContentDisposition().toString())
                .contains("inline");
    }

    @Test
    void downloadAttachment_withNonImageContentType_returnsAttachmentDisposition() {
        UUID id = UUID.randomUUID();
        CommAttachment attachment = new CommAttachment();
        attachment.setId(id);
        attachment.setContentType("application/pdf");
        attachment.setOriginalName("doc.pdf");
        attachment.setStoragePath("42/doc.pdf");

        Resource resource = mock(Resource.class);
        when(attachmentRepository.findByIdAndEntrepriseId(id, 42L))
                .thenReturn(Optional.of(attachment));
        when(fileStorageService.loadAsResource("42/doc.pdf")).thenReturn(resource);

        var response = controller.downloadAttachment(id);

        assertThat(response.getHeaders().getContentDisposition().toString())
                .contains("attachment");
    }

    @Test
    void downloadAttachment_withMissingAttachment_throwsNotFound() {
        UUID id = UUID.randomUUID();
        when(attachmentRepository.findByIdAndEntrepriseId(id, 42L))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.downloadAttachment(id))
                .isInstanceOf(CommunicationException.class)
                .hasMessageContaining("Attachment not found");
    }
}
